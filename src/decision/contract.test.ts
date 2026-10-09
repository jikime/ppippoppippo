import { describe, expect, test } from 'vitest';
import { decisionRequest, parseContext, parseResult } from './contract';
import { ACTION_LABELS } from '../simulation/agenda';

const context={phase:'lunch',minute:720,inside:120,moving:30,waiting:0,blocked:0,expected:0,guidance:false,exits:['A','B','C'].map(id=>({id,open:true,queue:0})),note:'점심 이동을 나눠서 진행해 줘'};
// Contract fixtures are not live Jev outputs.
const fixture=()=>({model:'jev-test-fixture',answers:{action:{type:'choice',choice:'stagger_meals',confidence:.94,
  probabilities:Object.fromEntries(Object.keys(ACTION_LABELS).map(key=>[key,key==='stagger_meals'?.95:.01]))}},usage:{input_tokens:100,output_tokens:20}});
describe('Jev 판단 경계',()=>{
  test('정해진 상황 필드만 외부 API에 보낸다',()=>{
    const result=parseContext({...context,apiKey:'must-not-be-forwarded',people:['private']});
    expect(result).not.toHaveProperty('apiKey');expect(result).not.toHaveProperty('people');
    const request=decisionRequest(result);expect(request.model).toBe('jev-latest');expect(request.state.allowed_actions).toContain('stagger_meals');expect(request.state.allowed_actions).not.toContain('guide_departure');
  });
  test('잘못된 입력과 큰 메모를 거절한다',()=>{
    for(const invalid of [{...context,phase:'unknown'},{...context,inside:-1},{...context,minute:Infinity},{...context,note:'x'.repeat(401)},{...context,exits:[]}])expect(()=>parseContext(invalid)).toThrow();
  });
  test('유효한 확률과 모델 버전·사용량을 보존한다',()=>{
    const result=parseResult(fixture(),321);expect(result.action).toBe('stagger_meals');expect(result.elapsedMs).toBe(321);expect(result.usage.input_tokens).toBe(100);
  });
  test('허용되지 않은 동작·NaN·비정상 확률 분포를 거절한다',()=>{
    const badAction=fixture();badAction.answers.action.choice='close_all_doors';expect(()=>parseResult(badAction,1)).toThrow();
    const badConfidence=fixture();badConfidence.answers.action.confidence=NaN;expect(()=>parseResult(badConfidence,1)).toThrow();
    const badProbability=fixture();badProbability.answers.action.probabilities.stagger_meals=1;expect(()=>parseResult(badProbability,1)).toThrow();
  });
});
