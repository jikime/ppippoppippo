import {safeModelURL} from './pipeline.mjs';
// AWS static deployment talks to the authenticated API through CloudFront /api/*.
// Only the application's operator token belongs here, never IAM or OpenAI credentials.
export async function awsRequest(body, token, fetcher=fetch) {
  const id=body.id||body.requestId;
  let path='/health', method='GET', payload;
  if(body.action==='generate'){path='/jobs';method='POST';payload={requestId:body.requestId,characterId:body.characterId||body.requestId,prompt:body.prompt,seed:body.seed,quality:body.quality,heightMeters:body.heightMeters};}
  else if(['status','retry','download'].includes(body.action)){
    if(!/^[a-f0-9-]{36}$/i.test(id||''))throw new Error('작업 ID가 올바르지 않습니다.');
    path=`/jobs/${id}${body.action==='retry'?'/retry':body.action==='download'?'/model':''}`;
    if(body.action==='retry'){method='POST';payload={allowImageRetry:body.allowImageRetry===true};}
  }else if(body.action!=='verify')throw new Error('지원하지 않는 작업입니다.');
  const r=await fetcher('/api'+path,{method,headers:{Authorization:`Bearer ${token}`,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
  const result=await r.json();
  if(!r.ok)throw new Error(result.error?.message||result.error||`AWS API 오류 (${r.status})`);
  if(body.action==='verify'&&(result.ok!==true||result.service!=='static-character-jobs'))throw new Error('AWS 작업 API 응답을 확인할 수 없습니다.');
  if(body.action!=='download')return result;
  const url=safeModelURL(result.url);
  const response=await fetcher(url.href,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(90000)});
  if(!response.ok||!response.body)throw new Error('GLB 다운로드에 실패했습니다.');
  const limit=100*1024*1024,reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('GLB가 100 MB를 넘습니다.');chunks.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const view=new DataView(bytes.buffer);
  if(size<12||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==size)throw new Error('유효한 GLB 2 파일이 아닙니다.');
  return bytes.buffer;
}
