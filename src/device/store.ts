import { create } from 'zustand';
import { world } from '../simulation/world';
import { alertKey, SimulationAlerts, sortAlerts } from './alerts';
import type { DeviceAlert, DeviceState } from './alerts';

interface DeviceStore {
  alerts: DeviceAlert[]; tests: DeviceAlert[]; state: DeviceState | null; error: string;
  toggleTest: (kind: DeviceAlert['kind'], zone: number) => void;
  clearTests: () => void;
}
export const useDevice = create<DeviceStore>((set,get) => ({
  alerts:[], tests:[], state:null, error:'',
  toggleTest:(kind,zone)=>{
    const alert: DeviceAlert = {kind,zone,source:'test'};
    const exists = get().tests.some(a=>alertKey(a)===alertKey(alert));
    set({tests:exists ? get().tests.filter(a=>alertKey(a)!==alertKey(alert)) : [...get().tests,alert]});
  },
  clearTests:()=>set({tests:[]}),
}));

export function startDeviceSync() {
  const publisher = crypto.randomUUID(), rules = new SimulationAlerts();
  let stopped = false, sequence = 0, timer: ReturnType<typeof setTimeout>;
  const controller = new AbortController();
  const tick = async () => {
    const snapshot = world.snapshot();
    const alerts = sortAlerts([...rules.update(snapshot,Date.now()), ...useDevice.getState().tests]);
    useDevice.setState({alerts});
    try {
      const response = await fetch('/api/device/publish', {
        method:'POST', headers:{'Content-Type':'application/json'},
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(3000)]),
        body:JSON.stringify({publisher,sequence:++sequence,ready:snapshot.ready&&!snapshot.error,alerts}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '디바이스 연결 서버에 접근하지 못했습니다.');
      if (!stopped) useDevice.setState({state:body as DeviceState,error:''});
    } catch (error) {
      if (!stopped) useDevice.setState(previous => ({
        state:previous.state ? {...previous.state,display:{...previous.state.display,fresh:false},bridge:{...previous.state.bridge,connected:false},
          devices:{display:{...previous.state.devices.display,connected:false},beacon:{...previous.state.devices.beacon,connected:false}}} : null,
        error:error instanceof Error ? error.message : '디바이스 연결 오류입니다.',
      }));
    }
    if (!stopped) timer = setTimeout(tick,1000);
  };
  void tick();
  return () => { stopped=true; clearTimeout(timer); controller.abort(); };
}
