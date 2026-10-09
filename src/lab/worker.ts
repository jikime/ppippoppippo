import { runPair } from './engine';
import { validConfig } from './model';
import type { PairResult, RunConfig } from './model';

self.onmessage=(event:MessageEvent<{config:RunConfig;start:number;stride:number}>)=>{
  const {config,start,stride}=event.data;
  if(!validConfig(config)||stride<1){self.postMessage({type:'error',message:'실험 설정이 유효하지 않습니다.'});return;}
  let batch:PairResult[]=[];
  try {
    for(let i=start;i<config.count;i+=stride){
      batch.push(runPair(config,i));
      if(batch.length===20){self.postMessage({type:'batch',results:batch});batch=[];}
    }
    if(batch.length)self.postMessage({type:'batch',results:batch});
    self.postMessage({type:'done'});
  } catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:'실험 계산 실패'});}
};
