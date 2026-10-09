import { describe, expect, test } from 'vitest';
import { DeviceHub, SOURCE_TIMEOUT } from './device';
const request = (sequence=1) => ({publisher:'test-publisher',sequence,ready:true,alerts:[{kind:'fire',zone:2,source:'test'}]});
describe('디바이스 연결 상태',()=>{
  test('LED·스피커와 화면의 응답은 서로 덮어쓰지 않는다',()=>{
    const hub=new DeviceHub(), state=hub.publish(request(),0);
    const ack={epoch:state.epoch,revision:state.revision,port:'tuya',ok:true};
    hub.acknowledge(ack,1);
    let current=hub.acknowledge({...ack,device:'beacon',port:'esp32'},2);
    expect(current.devices.display).toMatchObject({connected:true,port:'tuya'});
    expect(current.devices.beacon).toMatchObject({connected:true,port:'esp32'});
    current=hub.acknowledge({...ack,device:'beacon',port:'esp32',ok:false},3);
    expect(current.bridge.connected).toBe(true);
    expect(current.devices.beacon.connected).toBe(false);
    expect(()=>hub.acknowledge({...ack,device:'unknown'},4)).toThrow();
    expect(hub.snapshot(5001).devices.display.connected).toBe(false);
  });
  test('스피커 오류와 음소거 상태를 LED 수신 응답과 구분한다',()=>{
    const hub=new DeviceHub(),state=hub.publish(request(),0);
    const ack={device:'beacon',epoch:state.epoch,revision:state.revision,port:'esp32',ok:true,
      telemetry:{audioReady:false,muted:true,playing:false,volume:55,completed:2}};
    const beacon=hub.acknowledge(ack,1).devices.beacon;
    expect(beacon.connected).toBe(true);
    expect(beacon.telemetry).toEqual(ack.telemetry);
    expect(()=>hub.acknowledge({...ack,telemetry:{...ack.telemetry,volume:100}},2)).toThrow();
  });
  test('USB ACK 전에는 연결됨으로 표시하지 않고 현재 경고 응답만 인정한다',()=>{
    const hub=new DeviceHub(), state=hub.publish(request(),0);
    expect(state.bridge.connected).toBe(false);
    expect(()=>hub.acknowledge({epoch:state.epoch,revision:state.revision-1,port:'usb',ok:true},1)).toThrow();
    expect(hub.acknowledge({epoch:state.epoch,revision:state.revision,port:'usb',ok:true},1).bridge.connected).toBe(true);
    expect(hub.snapshot(5001).bridge.connected).toBe(false);
  });
  test('같은 경고의 heartbeat는 revision을 바꾸지 않는다',()=>{
    const hub=new DeviceHub(), first=hub.publish(request(),0);
    expect(hub.publish(request(2),1000).revision).toBe(first.revision);
  });
  test('연결이 끊겨도 마지막 화재 경고를 유지하고 신선도만 바뀐다',()=>{
    const hub=new DeviceHub(); hub.publish(request(),0);
    expect(hub.snapshot(SOURCE_TIMEOUT).display).toMatchObject({kind:'fire',fresh:false});
    expect(hub.publish({...request(2),ready:false,alerts:[]},SOURCE_TIMEOUT+1).display).toMatchObject({kind:'fire',fresh:false});
    expect(hub.publish({...request(3),alerts:[]},SOURCE_TIMEOUT+2).display).toMatchObject({kind:'clear',fresh:true});
  });
  test('늦은 요청과 다른 탭의 초기 상태가 활성 경고를 덮어쓰지 못한다',()=>{
    const hub=new DeviceHub(); hub.publish(request(2),0);
    expect(()=>hub.publish({...request(1),alerts:[]},1000)).toThrow();
    expect(()=>hub.publish({...request(3),publisher:'another-tab',alerts:[]},1000)).toThrow();
    expect(hub.snapshot(1000).display.kind).toBe('fire');
    expect(hub.publish({...request(1),publisher:'another-tab',alerts:[]},SOURCE_TIMEOUT).display.kind).toBe('clear');
  });
});
