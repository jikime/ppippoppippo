import { randomInt } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { displayFor, integer, isObject, parseAlerts } from '../src/device/alerts.ts';
import type { BridgeState, DeviceAlert, DeviceId, DeviceState, DisplayState } from '../src/device/alerts.ts';

export const SOURCE_TIMEOUT = 8000;
export class DeviceHub {
  readonly epoch = randomInt(1, 0x7fffffff);
  private revision = 0;
  private publisher = '';
  private sequence = -1;
  private receivedAt: number | null = null;
  private ready = false;
  private alerts: DeviceAlert[] = [];
  private display: DisplayState = displayFor([], false);
  private devices: Record<DeviceId, BridgeState> = {
    display:{connected:false,port:'',lastAck:null,acknowledgedRevision:null},
    beacon:{connected:false,port:'',lastAck:null,acknowledgedRevision:null},
  };
  publish(input: unknown, now = Date.now()): DeviceState {
    if (!isObject(input) || typeof input.publisher !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(input.publisher) ||
      !integer(input.sequence,0,0x7fffffff) || typeof input.ready !== 'boolean') throw new Error('경고 송신 정보가 올바르지 않습니다.');
    const alerts = parseAlerts(input.alerts);
    if (this.publisher && input.publisher !== this.publisher && this.receivedAt !== null && now-this.receivedAt < SOURCE_TIMEOUT)
      throw new Error('다른 관제 창이 디바이스에 전송 중입니다. 해당 창을 닫고 잠시 기다려 주세요.');
    if (input.publisher === this.publisher && input.sequence <= this.sequence) throw new Error('이전 경고 요청은 적용하지 않습니다.');
    this.publisher = input.publisher; this.sequence = input.sequence; this.receivedAt = now; this.ready = input.ready;
    if (input.ready) this.alerts = alerts;
    return this.snapshot(now);
  }
  acknowledge(input: unknown, now = Date.now()): DeviceState {
    const current = this.snapshot(now);
    if (!isObject(input) || input.epoch !== this.epoch || input.revision !== current.revision ||
      typeof input.port !== 'string' || input.port.length > 128 || typeof input.ok !== 'boolean') throw new Error('디바이스 응답이 현재 경고와 일치하지 않습니다.');
    const id = input.device ?? 'display'; // Existing Tuya bridges remain compatible.
    if (id !== 'display' && id !== 'beacon') throw new Error('지원하지 않는 디바이스입니다.');
    let telemetry;
    if (id==='beacon' && input.telemetry!==undefined) {
      const t=input.telemetry;
      if (!isObject(t) || typeof t.audioReady!=='boolean' || typeof t.muted!=='boolean' || typeof t.playing!=='boolean' ||
        !integer(t.volume,10,75) || !integer(t.completed,0,0xffffffff)) throw new Error('음성 보드 상태가 올바르지 않습니다.');
      telemetry={audioReady:t.audioReady,muted:t.muted,playing:t.playing,volume:t.volume,completed:t.completed};
    }
    this.devices[id] = {connected:input.ok,port:input.port,lastAck:input.ok?now:null,
      acknowledgedRevision:input.ok?current.revision:null,...(telemetry?{telemetry}:{})};
    return this.snapshot(now);
  }
  snapshot(now = Date.now()): DeviceState {
    // Keep the last alarm when its publisher disappears. A lost connection never means all clear.
    const fresh = this.ready && this.receivedAt !== null && now-this.receivedAt < SOURCE_TIMEOUT;
    const display = displayFor(this.alerts, fresh);
    if (JSON.stringify(display) !== JSON.stringify(this.display)) { this.display = display; this.revision++; }
    const status = (id: DeviceId): BridgeState => {
      const device = this.devices[id];
      return {...device,connected:device.lastAck!==null && now-device.lastAck<5000 && device.acknowledgedRevision===this.revision};
    };
    const devices = {display:status('display'),beacon:status('beacon')};
    return { epoch:this.epoch, revision:this.revision, display:{...this.display}, alerts:this.alerts.map(a=>({...a})),
      bridge:devices.display, devices };
  }
}

export function devicePlugin(): Plugin {
  const hub = new DeviceHub();
  const send = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data));
  };
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/api/device/')) { next(); return; }
    // USB control is local to the attached Mac. Reject LAN callers and browser cross-origin writes.
    const address = req.socket.remoteAddress;
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address??'')) { send(res,403,{error:'디바이스 연결은 이 맥의 localhost에서 사용해 주세요.'}); return; }
    try {
      const host = new URL(`http://${req.headers.host}`).hostname;
      if (!['localhost','127.0.0.1','[::1]'].includes(host) || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host))
        throw new Error('origin');
    } catch { send(res,403,{error:'허용되지 않은 요청 출처입니다.'}); return; }
    if (path==='/api/device/state' && req.method==='GET') { send(res,200,hub.snapshot()); return; }
    if (!['/api/device/publish','/api/device/ack'].includes(path) || req.method!=='POST') { send(res,404,{error:'지원하지 않는 디바이스 API입니다.'}); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) { send(res,415,{error:'JSON 요청이 필요합니다.'}); return; }
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size+=chunk.length; if(size>8192) { send(res,413,{error:'요청이 너무 큽니다.'}); return; } chunks.push(Buffer.from(chunk)); }
      const input: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      send(res,200,path==='/api/device/publish' ? hub.publish(input) : hub.acknowledge(input));
    } catch (error) { send(res,400,{error:error instanceof Error ? error.message : '디바이스 요청을 처리하지 못했습니다.'}); }
  };
  return {name:'crowdguard-device',configureServer(server){server.middlewares.use(middleware);},configurePreviewServer(server){server.middlewares.use(middleware);}};
}
