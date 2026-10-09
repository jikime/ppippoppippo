import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useLab } from './store';
import { runPair } from './engine';
import type { RunConfig } from './model';

class FakeWorker {
  static instances:FakeWorker[]=[];
  stopped=false;onerror:(()=>void)|null=null;onmessage:((event:{data:unknown})=>void)|null=null;
  job?:{config:RunConfig;start:number;stride:number};
  constructor(){FakeWorker.instances.push(this);}
  postMessage(job:FakeWorker['job']){this.job=job;}
  terminate(){this.stopped=true;}
  emit(data:unknown){this.onmessage?.({data});}
}
beforeEach(()=>{vi.stubGlobal('Worker',FakeWorker);vi.stubGlobal('navigator',{hardwareConcurrency:4});useLab.setState(useLab.getInitialState());FakeWorker.instances=[];});
afterEach(()=>{useLab.getState().cancel();vi.unstubAllGlobals();});
test('cancel retains only complete received pairs and late worker messages cannot contaminate a new run',()=>{
  const lab=useLab.getState();lab.start();const old=FakeWorker.instances[0],config=old.job!.config;
  old.emit({type:'batch',results:[runPair(config,0)]});lab.cancel();
  expect(useLab.getState().status).toBe('cancelled');expect(useLab.getState().results).toHaveLength(1);expect(old.stopped).toBe(true);
  old.emit({type:'batch',results:[runPair(config,1)]});expect(useLab.getState().results).toHaveLength(1);
  lab.start();old.emit({type:'batch',results:[runPair(config,2)]});expect(useLab.getState().results).toHaveLength(0);
});
test('missing or duplicate results cannot be presented as a completed experiment',()=>{
  useLab.getState().start();for(const w of FakeWorker.instances)w.emit({type:'done'});
  expect(useLab.getState().status).toBe('error');expect(useLab.getState().approval).toBeNull();
  useLab.getState().start();const worker=FakeWorker.instances.at(-1)!,r=runPair(worker.job!.config,0);
  worker.emit({type:'batch',results:[r,r]});expect(useLab.getState().status).toBe('error');expect(useLab.getState().results).toHaveLength(0);
});
test('approval requires a complete matching run and any setting change revokes it',()=>{
  useLab.getState().configure({count:3});useLab.getState().start();
  for(const w of FakeWorker.instances){w.emit({type:'batch',results:[runPair(w.job!.config,w.job!.start)]});w.emit({type:'done'});}
  expect(useLab.getState().status).toBe('completed');useLab.getState().approve();expect(useLab.getState().approval?.count).toBe(3);
  useLab.getState().configure({seed:12});expect(useLab.getState().approval).toBeNull();useLab.getState().approve();expect(useLab.getState().approval).toBeNull();
});
