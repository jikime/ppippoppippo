import { describe, expect, test } from 'vitest';
import { decisionRequest, DecisionRefusal, parseContext, parseResult } from './contract';
import { ACTION_LABELS } from '../simulation/agenda';

const context={phase:'lunch',minute:720,inside:120,moving:30,waiting:0,blocked:0,expected:0,guidance:false,exits:['A','B','C'].map(id=>({id,open:true,queue:0})),note:'점심 이동을 나눠서 진행해 줘'};
// Fixtures follow the official Decisions wire format; these are not live responses.
const fixture=()=>({model:'gpt-6-luna-test-fixture',answers:[{type:'choice',name:'action',choice:'stagger_meals',confidence:.94,
  probabilities:Object.keys(ACTION_LABELS).map(value=>({value,probability:value==='stagger_meals'?.95:.01}))}],usage:{input_tokens:100,output_tokens:0}});
describe('OpenAI Decisions 판단 경계',()=>{
  test('정해진 상황 필드만 문자열 input에 담고 choice 질문을 배열로 보낸다',()=>{
    const result=parseContext({...context,apiKey:'must-not-be-forwarded',people:['private']});
    expect(result).not.toHaveProperty('apiKey');expect(result).not.toHaveProperty('people');
    const request=decisionRequest(result),input=JSON.parse(request.input);
    expect(request.model).toBe('gpt-6-luna');expect(input.allowed_actions).toContain('stagger_meals');expect(input.allowed_actions).not.toContain('guide_departure');
    expect(request.questions[0]).toMatchObject({name:'action',type:'choice'});
    expect(typeof request.questions[0].instructions).toBe('string');
    expect(request.questions[0].choices.map(c=>c.value)).toEqual(Object.keys(ACTION_LABELS));
  });
  test('잘못된 입력과 큰 메모를 거절한다',()=>{
    for(const invalid of [{...context,phase:'unknown'},{...context,inside:-1},{...context,minute:Infinity},{...context,note:'x'.repeat(401)},{...context,exits:[]}])expect(()=>parseContext(invalid)).toThrow();
  });
  test('배열 응답의 확률·확신도·모델 버전·사용량을 보존한다',()=>{
    const result=parseResult(fixture(),321);expect(result.source).toBe('openai-decisions');expect(result.action).toBe('stagger_meals');expect(result.elapsedMs).toBe(321);expect(result.usage).toEqual({input_tokens:100,output_tokens:0});expect(result.probabilities.stagger_meals).toBe(.95);expect(result.confidence).toBe(.94);
  });
  test('허용되지 않은 동작·NaN·비정상 확률 분포를 거절한다',()=>{
    const badAction=fixture();badAction.answers[0].choice='close_all_doors';expect(()=>parseResult(badAction,1)).toThrow();
    const badConfidence=fixture();badConfidence.answers[0].confidence=NaN;expect(()=>parseResult(badConfidence,1)).toThrow();
    const badProbability=fixture();badProbability.answers[0].probabilities[0].probability=1;expect(()=>parseResult(badProbability,1)).toThrow();
  });
  test('누락·중복된 확률과 다른 질문의 답을 거절한다',()=>{
    const duplicate=fixture();duplicate.answers[0].probabilities[1]=duplicate.answers[0].probabilities[0];expect(()=>parseResult(duplicate,1)).toThrow();
    const missing=fixture();missing.answers[0].probabilities.pop();expect(()=>parseResult(missing,1)).toThrow();
    const wrongQuestion=fixture();wrongQuestion.answers[0].name='other';expect(()=>parseResult(wrongQuestion,1)).toThrow();
    expect(()=>parseResult({...fixture(),answers:{action:fixture().answers[0]}},1)).toThrow();
  });
  test('refusal을 행동 제안으로 변환하지 않는다',()=>{
    expect(()=>parseResult({...fixture(),answers:[{type:'refusal',name:'action'}]},1)).toThrow(DecisionRefusal);
  });
});
