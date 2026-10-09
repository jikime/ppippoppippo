import { useState } from 'react';
import type { CSSProperties } from 'react';
import { AlertTriangle, Check, Plug, ShieldCheck, Usb, Volume2 } from 'lucide-react';
import { alertInfo, alertKey, catalog, displayFor } from './alerts';
import type { DeviceAlert } from './alerts';
import { useDevice } from './store';
import './device.css';

const tests: DeviceAlert['kind'][] = ['fire','fall','medical','weapon','congestion'];
export function DevicePanel() {
  const device = useDevice(), [zone,setZone] = useState(0);
  const display = device.state?.display ?? displayFor(device.alerts,false);
  const info = alertInfo(display.kind), connected = device.state?.bridge.connected === true;
  const beaconConnected = device.state?.devices?.beacon.connected === true;
  const audio = beaconConnected ? device.state?.devices.beacon.telemetry : undefined;
  const patterns: Record<typeof display.kind,string> = {clear:'초록 숨쉬기',exit_closed:'노랑 점멸',congestion:'노랑 숨쉬기',route_blocked:'노랑 회전',all_exits_closed:'빨강 동시 점멸',fall:'빨강 두 번 점멸',medical:'빨강 맥박 점멸',fire:'빨강 경고 점멸',weapon:'빨강 교차 점멸'};
  const accent = catalog.colors[info.severity === 'critical' ? 'critical' : info.severity === 'warning' ? 'warning' : display.fresh ? 'normal' : 'waiting'];
  const palette = {'--device-accent':accent,'--device-background':catalog.colors.background,'--device-text':catalog.colors.text,
    '--device-live':catalog.colors.normal,'--device-waiting':catalog.colors.waiting} as CSSProperties;
  return <section className="device-panel">
    <div className={`device-connection ${connected?'connected':''}`} role="status"><Usb size={17}/><div><strong>{connected?'Tuya 화면 · 응답 확인':'Tuya 화면 · 연결 대기'}</strong><small>{connected?'마지막 전송에 보드가 응답했습니다.':'USB 연결과 알림 펌웨어를 확인해 주세요.'}</small></div></div>
    <div className={`device-connection ${beaconConnected?'connected':''}`} role="status"><Volume2 size={17}/><div><strong>{beaconConnected?'ESP32 LED·음성 · 응답 확인':'ESP32 LED·음성 · 연결 대기'}</strong><small>{beaconConnected?'LED 상태 적용 응답을 받았습니다. 음성은 보드에 저장된 안내를 재생합니다.':'ESP32 보드와 LED·음성 브리지를 확인해 주세요.'}</small></div></div>
    <div className="device-beacon-preview" style={palette}>
      <div className={`device-led-ring pattern-${display.fresh?display.kind:display.kind==='clear'?'waiting':display.kind}`} aria-hidden="true">{Array.from({length:7},(_,i)=><i key={i} style={{'--led-index':i} as CSSProperties}/>)}</div>
      <div><strong>{!display.fresh&&display.kind==='clear'?'하늘색 연결 대기':patterns[display.kind]}</strong><small>7개 LED · 한국어 AI 합성 음성</small></div>
    </div>
    {audio&&<p className={audio.audioReady?'device-caption':'device-error'} role="status">{!audio.audioReady?'스피커 초기화 또는 재생 오류 · LED 경고는 계속됩니다.':`음량 ${audio.volume}% · ${audio.muted?'현재 안내 음소거':audio.playing?'음성 안내 중':'음성 준비 완료'} · 재생 완료 ${audio.completed}회`}</p>}
    <p className="device-caption">가운데 버튼은 현재 안내 음소거, 길게 누르면 다시 듣기입니다. 양옆 버튼으로 음량을 조절합니다. 새 경고는 음소거를 해제하고, 관제 연결이 끊겨도 마지막 경고 색을 유지합니다.</p>
    <div className="section-heading"><span>디스플레이 미리보기</span><small>320 × 480</small></div>
    <div className={`device-display ${info.severity}`} style={palette} aria-label="디바이스 경고 미리보기">
      <div className="device-screen-brand"><ShieldCheck size={16}/>{catalog.labels.brand}<span>{display.source==='test'?'시험 경고':'시뮬레이션'}</span></div>
      <div className={`device-freshness ${display.fresh?'':'stale'}`}>{display.fresh?'관제 수신 중':'연결 대기 · 마지막 안내'}</div>
      <div className="device-screen-content">{display.kind==='clear'?<ShieldCheck size={45}/>:<AlertTriangle size={45}/>}<small>{display.kind==='clear'?'관제 안내':info.severity==='critical'?'위험 경고':'주의 안내'}</small><h3>{info.title}</h3><span className="device-zone">{catalog.zones[display.zone]}</span><p>{info.instruction}</p></div>
      <div className="device-screen-footer">전체 경고 <b>{display.count}건</b></div>
    </div>
    {device.error&&<p className="device-error" role="status">{device.error}</p>}
    <p className="device-caption">출입구 통제는 즉시, 이동 정체는 지속 시간을 확인한 뒤 전달합니다. 화면은 가장 우선순위가 높은 경고를 보여줍니다.</p>
    <div className="section-heading"><span>위험 경고 시험</span><span>실제 감지 아님</span></div>
    <label className="device-zone-select">시험 위치<select aria-label="위험 경고 시험 위치" value={zone} onChange={e=>setZone(Number(e.target.value))}>{catalog.zones.map((name,index)=><option key={name} value={index}>{name}</option>)}</select></label>
    <div className="device-test-buttons">{tests.map(kind=>{
      const active=device.tests.some(a=>a.kind===kind&&a.zone===zone);
      return <button key={kind} aria-pressed={active} onClick={()=>device.toggleTest(kind,zone)}>{active?<Check size={13}/>:<AlertTriangle size={13}/>} {alertInfo(kind).title}</button>;
    })}</div>
    {device.tests.length>0&&<button className="device-clear" onClick={()=>device.clearTests()}>시험 경고 모두 해제</button>}
    {device.alerts.length>0&&<ul className="device-alert-list">{device.alerts.map(a=><li key={alertKey(a)}><b>{alertInfo(a.kind).title}</b><span>{catalog.zones[a.zone]} · {a.source==='test'?'시험':'시뮬레이션'}</span></li>)}</ul>}
    <details className="device-help"><summary><Plug size={13}/>USB 연결 방법</summary><p>알림 펌웨어 설치 후 장치별 브리지를 각각 실행해 주세요.</p><code>npm run device:bridge</code><code>npm run device:beacon</code><p>연결 상태는 각 보드의 응답을 기준으로 표시합니다. 자세한 설정은 device/README.md에 있습니다.</p></details>
  </section>;
}
