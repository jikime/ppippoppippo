import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('../simulation/world',()=>({world:{snapshot:()=>({ready:true,error:null,revision:1,waiting:0,blocked:0,inside:120,
  exits:['A','B','C'].map(id=>({id,open:true,queue:0,assigned:0,departed:0})),
})}}));
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});

describe('배포 환경의 디바이스 연결',()=>{
  test('웹 미리보기에서는 경고만 갱신하고 USB API를 반복 호출하지 않는다',async()=>{
    vi.stubEnv('VITE_DEVICE_MODE','preview');vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn());
    const {startDeviceSync,useDevice}=await import('./store');
    useDevice.getState().toggleTest('fire',2);
    const stop=startDeviceSync();
    await vi.advanceTimersByTimeAsync(3100);
    expect(useDevice.getState().alerts).toContainEqual({kind:'fire',zone:2,source:'test'});
    expect(useDevice.getState().state).toBeNull();
    expect(useDevice.getState().error).toBe('');
    expect(fetch).not.toHaveBeenCalled();
    stop();expect(vi.getTimerCount()).toBe(0);
  });
  test('기본 로컬 모드에서는 기존 브리지 API로 전송한다',async()=>{
    vi.stubEnv('VITE_DEVICE_MODE','');vi.useFakeTimers();
    const state={bridge:{connected:false}};
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(state))));
    const {startDeviceSync,useDevice}=await import('./store');
    const stop=startDeviceSync();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledWith('/api/device/publish',expect.objectContaining({method:'POST'}));
    expect(useDevice.getState().state).toEqual(state);
    stop();expect(vi.getTimerCount()).toBe(0);
  });
});
