import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ACTION_LABELS } from '../../src/simulation/agenda';
import { RULES } from '../../src/lab/model';
import { createAuthorizer, createHandler } from './handler';
import type { HttpEvent } from './handler';

const secret='fixture-origin-token-with-at-least-32-bytes';
const key='fixture-server-only-api-key';
const host='example.cloudfront.net';
const context={phase:'lunch',minute:720,inside:120,moving:30,waiting:0,blocked:0,expected:0,guidance:false,
  exits:['A','B','C'].map(id=>({id,open:true,queue:0})),note:'점심 이동을 나눠서 진행해 줘'};
function event(path='evaluate',body:unknown=context):HttpEvent {
  return {version:'2.0',rawPath:`/api/decisions/${path}`,
    headers:{host:'origin.execute-api.ap-southeast-2.amazonaws.com','x-viewer-host':host,
      'x-origin-verify':secret,origin:`https://${host}`,'content-type':'application/json'},
    requestContext:{http:{method:path==='status'?'GET':'POST'}},body:JSON.stringify(body)};
}
const result=()=>({model:'gpt-6-luna-fixture',answers:[{type:'choice',name:'action',choice:'stagger_meals',confidence:.94,
  probabilities:Object.keys(ACTION_LABELS).map(value=>({value,probability:value==='stagger_meals'?1:0}))}],usage:{input_tokens:100,output_tokens:0}});
beforeEach(()=>{vi.stubGlobal('fetch',vi.fn());});
afterEach(()=>{vi.unstubAllGlobals();});

describe('AWS Decisions HTTP adapter',()=>{
  test('직접 API 호출과 위조한 origin 인증 값을 차단한다',async()=>{
    for(const token of [undefined,'wrong','x'.repeat(secret.length)]) {
      const request=event();request.headers!['x-origin-verify']=token;
      expect((await createHandler(key,secret)(request)).statusCode).toBe(403);
      expect(await createAuthorizer(secret)(request)).toEqual({isAuthorized:false});
    }
    expect(await createAuthorizer('')({headers:{'x-origin-verify':''}})).toEqual({isAuthorized:false});
    expect(await createAuthorizer(secret)(event())).toEqual({isAuthorized:true});
    expect(fetch).not.toHaveBeenCalled();
  });
  test('API Gateway Host 대신 검증된 CloudFront Host로 same-origin을 판단한다',async()=>{
    const handler=createHandler(key,secret);
    const status=await handler(event('status'));
    expect(status.statusCode).toBe(200);
    expect(JSON.parse(status.body)).toEqual({configured:true,model:'gpt-6-luna'});
    expect(status.body).not.toContain(key);
    const request=event();request.headers!.origin='https://unrelated.example';
    expect((await handler(request)).statusCode).toBe(403);
    delete request.headers!['x-viewer-host'];
    expect((await handler(request)).statusCode).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  test('키가 없으면 상태를 알리고 유료 API 호출을 하지 않는다',async()=>{
    const handler=createHandler('',secret);
    expect(JSON.parse((await handler(event('status'))).body).configured).toBe(false);
    expect((await handler(event())).statusCode).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  test('base64 요청을 기존 계약으로 검증하고 서버 키로 Decisions API를 호출한다',async()=>{
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(result())));
    const request=event();request.body=Buffer.from(request.body!).toString('base64');request.isBase64Encoded=true;
    const response=await createHandler(key,secret)(request);
    expect(response.statusCode).toBe(200);
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(JSON.parse(response.body)).toMatchObject({action:'stagger_meals',source:'openai-decisions'});
    const [url,init]=vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/decisions');
    expect(init?.headers).toMatchObject({Authorization:`Bearer ${key}`});
    expect(JSON.parse(init?.body as string).model).toBe('gpt-6-luna');
    expect(response.body).not.toContain(key);
    expect(response.body).not.toContain(secret);
  });
  test('검토 API도 기존 review 계약을 사용한다',async()=>{
    const choices=[...Object.keys(RULES),'investigate'];
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({model:'gpt-6-luna-fixture',answers:[{
      name:'review_priority',type:'choice',choice:'investigate',confidence:.9,
      probabilities:choices.map(value=>({value,probability:value==='investigate'?1:0})),
    }]})));
    const response=await createHandler(key,secret)(event('review',{completed:1,seed:123,findings:[]}));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).rule).toBe('investigate');
  });
  test('잘못된 형식·미지원 경로·8 KiB 초과를 업스트림 호출 전에 거절한다',async()=>{
    const wrongType=event();wrongType.headers!['content-type']='text/plain';
    const wrongJson=event();wrongJson.body='{';
    const oversized=event();oversized.body='가'.repeat(3000);
    const noRoute=event();noRoute.rawPath='/api/device/publish';
    const cases:[HttpEvent,number][]=[[wrongType,415],[wrongJson,400],[event('evaluate',{}),400],
      [oversized,413],[noRoute,404],[{...event(),version:'1.0'},400]];
    for(const [request,status] of cases) expect((await createHandler(key,secret)(request)).statusCode).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });
  test.each([401,403,429,500])('업스트림 %s 응답 본문을 외부에 노출하지 않는다',async(status)=>{
    vi.mocked(fetch).mockResolvedValue(new Response(`private diagnostic: ${key}`,{status}));
    const response=await createHandler(key,secret)(event());
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain(key);
    expect(response.body).not.toContain('private diagnostic');
  });
  test('거절 응답을 동작 제안으로 바꾸지 않는다',async()=>{
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({...result(),answers:[{name:'action',type:'refusal'}]})));
    const response=await createHandler(key,secret)(event());
    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body)).not.toHaveProperty('action');
  });
  test('타임아웃은 정리된 오류로 반환한다',async()=>{
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error(key),{name:'TimeoutError'}));
    const response=await createHandler(key,secret)(event());
    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body).error).toContain('시간이 초과');
    expect(response.body).not.toContain(key);
  });
  test('한 Lambda 실행 환경 안의 중복 요청과 직후 재시도를 제한한다',async()=>{
    let finish!:(response:Response)=>void;
    vi.mocked(fetch).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    const handler=createHandler(key,secret),pending=handler(event());
    // Wait for the async request-body iterator, without any real network request.
    await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
    expect((await handler(event())).statusCode).toBe(429);
    finish(new Response(JSON.stringify(result())));
    expect((await pending).statusCode).toBe(200);
    expect((await handler(event())).statusCode).toBe(429);
  });
});
