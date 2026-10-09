import { describe, expect, test } from 'vitest';
import { detectionTransition, parseDetection } from './detection';
import type { Detection } from './detection';
import { BASELINE, IMPROVED, manualKey } from './model';
import type { Approval } from './store';
import { parseReview, parseReviewResult } from './review';

const input={id:'test-01',kind:'weapon',confidence:.9,zone:1,source:'demo'};
const event:Detection={...parseDetection(input),status:'candidate',manual:null,log:[]};
const approval:Approval={key:manualKey(IMPROVED),count:100,runSeed:2,at:'2026-10-09',scope:'simulation-only'};
describe('detection and approved simulation manual lifecycle',()=>{
  test('confidence is only a model score; candidates cannot execute before human confirmation',()=>{
    expect(()=>detectionTransition(event,'dispatch',IMPROVED,approval,'now')).toThrow();
    const confirmed=detectionTransition(event,'confirm',IMPROVED,null,'now');
    expect(()=>detectionTransition(confirmed,'dispatch',IMPROVED,null,'now')).toThrow();
  });
  test('matched approval is required, revocation blocks acknowledgement, and no out-of-order transitions',()=>{
    const confirmed=detectionTransition(event,'confirm',IMPROVED,approval,'now');
    expect(()=>detectionTransition(confirmed,'dispatch',BASELINE,approval,'now')).toThrow();
    const dispatched=detectionTransition(confirmed,'dispatch',IMPROVED,approval,'now');
    expect(dispatched.status).toBe('dispatched');expect(dispatched.manual).toBe(approval.key);
    expect(()=>detectionTransition(dispatched,'ack',IMPROVED,null,'now')).toThrow();
    const ack=detectionTransition(dispatched,'ack',IMPROVED,approval,'now');expect(ack.status).toBe('acknowledged');expect(ack.log).toHaveLength(3);
    expect(()=>detectionTransition(ack,'dispatch',IMPROVED,approval,'now')).toThrow();
  });
  test('rejected candidates cannot be revived and unsupported detection classes are rejected',()=>{
    const rejected=detectionTransition(event,'reject',IMPROVED,approval,'now');expect(()=>detectionTransition(rejected,'confirm',IMPROVED,approval,'now')).toThrow();
    for(const patch of [{confidence:NaN},{confidence:2},{kind:'person'},{zone:9},{id:'<script>'},{source:'trusted-real-camera'}])expect(()=>parseDetection({...input,...patch})).toThrow();
  });
});
test('OpenAI review accepts measured bounded evidence and rejects invalid or duplicate keys',()=>{
  const valid={completed:10,seed:1,findings:[{key:'missingProtocol',worlds:3,afterWorlds:0,regressedWorlds:0,peak:1,total:3,afterTotal:0,score:85,worldIndex:1,evidenceVariant:'before'}]};
  expect(parseReview(valid).completed).toBe(10);
  expect(()=>parseReview({...valid,findings:[...valid.findings,...valid.findings]})).toThrow();
  expect(()=>parseReview({...valid,findings:[{...valid.findings[0],worlds:12}]})).toThrow();
  expect(()=>parseReviewResult({model:'gpt-6-luna',answers:[{name:'review_priority',type:'refusal'}]},10)).toThrow();
  expect(()=>parseReviewResult({model:'gpt-6-luna',answers:[{name:'review_priority',type:'choice',choice:'auto_unlock_doors',confidence:.99,probabilities:[]}]},10)).toThrow();
});
