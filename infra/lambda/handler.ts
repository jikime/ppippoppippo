import { timingSafeEqual } from 'node:crypto';
import { createDecisionsMiddleware } from '../../server/decisions.ts';

// Only the HTTP API v2 fields this adapter consumes. No SDK is needed at runtime.
export interface HttpEvent {
  version?: string;
  rawPath: string;
  headers?: Record<string,string|undefined>;
  requestContext: { http: { method: string } };
  body?: string;
  isBase64Encoded?: boolean;
}
export interface HttpResult {
  statusCode: number;
  headers: Record<string,string>;
  body: string;
  isBase64Encoded: false;
}

function authorized(headers:HttpEvent['headers'],secret:string):boolean {
  const provided=headers?.['x-origin-verify']??'';
  return secret.length>=32 && Buffer.byteLength(provided)===Buffer.byteLength(secret)
    && timingSafeEqual(Buffer.from(provided),Buffer.from(secret));
}
function response(statusCode:number,error:string):HttpResult {
  return {statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify({error}),isBase64Encoded:false};
}

export function createHandler(key:string,originSecret:string) {
  const middleware=createDecisionsMiddleware(key);
  return async(event:HttpEvent):Promise<HttpResult>=>{
    const headers=Object.fromEntries(Object.entries(event.headers??{}).map(([k,v])=>[k.toLowerCase(),v]));
    // Defense in depth: the HTTP API authorizer also checks this secret.
    if (!authorized(headers,originSecret)) return response(403,'허용되지 않은 API 접근입니다.');
    const viewerHost=headers['x-viewer-host'];
    if (!viewerHost || !/^[a-z0-9.-]+$/i.test(viewerHost)) return response(403,'요청 출처를 확인하지 못했습니다.');
    if (event.version!=='2.0') return response(400,'지원하지 않는 요청 형식입니다.');
    if ((event.body?.length??0)>11000) return response(413,'요청이 너무 큽니다.');
    const body=Buffer.from(event.body??'',event.isBase64Encoded?'base64':'utf8');
    if (body.length>8192) return response(413,'요청이 너무 큽니다.');
    let result=response(404,'지원하지 않는 API입니다.');
    await middleware({
      url:event.rawPath,method:event.requestContext.http.method,
      // CloudFront overwrites x-viewer-host; API Gateway's Host is the origin domain.
      headers:{...headers,host:viewerHost},
      async *[Symbol.asyncIterator](){yield body;},
    },{
      writeHead(statusCode,responseHeaders){result={...result,statusCode,headers:responseHeaders};},
      end(value){result.body=value;},
    },()=>{});
    return result;
  };
}

export function createAuthorizer(originSecret:string) {
  return async(event:Pick<HttpEvent,'headers'>)=>({isAuthorized:authorized(event.headers,originSecret)});
}
export const handler=createHandler(process.env.OPENAI_API_KEY??'',process.env.ORIGIN_SECRET??'');
export const authorizer=createAuthorizer(process.env.ORIGIN_SECRET??'');
