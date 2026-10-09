import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { decisionRequest, DecisionRefusal, parseContext, parseResult } from '../src/decision/contract.ts';
import { parseReview, parseReviewResult, reviewRequest } from '../src/lab/review.ts';

// Shared by Vite and the AWS Lambda adapter; never imported by the browser.
export type DecisionHttpRequest = Pick<IncomingMessage,'url'|'method'|'headers'> & AsyncIterable<Uint8Array>;
export interface DecisionHttpResponse {
  writeHead(status:number,headers:Record<string,string>):unknown;
  end(body:string):unknown;
}
export function createDecisionsMiddleware(key:string) {
  let busy=false,lastRequest=0;
  const send=(res:DecisionHttpResponse,status:number,data:unknown)=>{
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));
  };
  return async(req:DecisionHttpRequest,res:DecisionHttpResponse,next:()=>void)=>{
    const path=req.url?.split('?')[0];if(!path?.startsWith('/api/decisions/')){next();return;}
    if(req.headers.origin){
      try{if(new URL(req.headers.origin).host!==req.headers.host){send(res,403,{error:'허용되지 않은 요청 출처입니다.'});return;}}
      catch{send(res,403,{error:'요청 출처를 확인하지 못했습니다.'});return;}
    }
    if(path==='/api/decisions/status'&&req.method==='GET'){send(res,200,{configured:!!key,model:'gpt-6-luna'});return;}
    const review=path==='/api/decisions/review';
    if((path!=='/api/decisions/evaluate'&&!review)||req.method!=='POST'){send(res,404,{error:'지원하지 않는 API입니다.'});return;}
    if(!key){send(res,503,{error:'서버에 OpenAI API 키가 설정되지 않았습니다.'});return;}
    if(busy||Date.now()-lastRequest<2500){send(res,429,{error:'잠시 후 다시 판단을 요청해 주세요.'});return;}
    if(!req.headers['content-type']?.startsWith('application/json')){send(res,415,{error:'JSON 요청이 필요합니다.'});return;}
    busy=true;lastRequest=Date.now();
    try{
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8192){send(res,413,{error:'요청이 너무 큽니다.'});return;}chunks.push(Buffer.from(chunk));}
      let request;
      try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));request=review?reviewRequest(parseReview(body)):decisionRequest(parseContext(body));}
      catch{send(res,400,{error:'판단 요청의 형식이 올바르지 않습니다.'});return;}
      const start=performance.now();
      const upstream=await fetch('https://api.openai.com/v1/decisions',{
        method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify(request),signal:AbortSignal.timeout(15000),
      });
      if(!upstream.ok){
        const message=upstream.status===401||upstream.status===403?'OpenAI 인증을 확인해 주세요.':upstream.status===429?'OpenAI 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.':'OpenAI가 판단을 반환하지 못했습니다.';
        send(res,502,{error:message});return;
      }
      const response=await upstream.json(),elapsed=Math.round(performance.now()-start);
      send(res,200,review?parseReviewResult(response,elapsed):parseResult(response,elapsed));
    }catch(error){send(res,error instanceof DecisionRefusal?422:502,{error:error instanceof DecisionRefusal?error.message:error instanceof Error&&error.name==='TimeoutError'?'OpenAI Decisions 응답 시간이 초과되었습니다. 다시 요청해 주세요.':'OpenAI Decisions 연결 또는 응답 검증에 실패했습니다.'});}
    finally{busy=false;}
  };
}

export function decisionsPlugin(key:string):Plugin {
  const middleware=createDecisionsMiddleware(key);
  return {name:'crowdguard-decisions',configureServer(server){server.middlewares.use(middleware);},configurePreviewServer(server){server.middlewares.use(middleware);}};
}
