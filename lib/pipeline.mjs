/** Fixed AWS worker transport. Pure Web API module shared by route and tests. */
export const MAX_MODEL_BYTES = 100 * 1024 * 1024;
const REGION = '[a-z]{2}(?:-[a-z0-9]+)+-\\d';
const WORKER_HOST = new RegExp(`^[a-z0-9]{10}\\.execute-api\\.${REGION}\\.amazonaws\\.com$`);
const S3_HOST = new RegExp(`^(?:(?:[a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\\.)?s3(?:\\.dualstack)?(?:[.-]${REGION})?\\.amazonaws\\.com$`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NATIVE_STATES = new Set(['QUEUED','RUNNING','SUCCEEDED','FAILED','NEEDS_ATTENTION']);
const PUBLIC_MESSAGES = {
  INVALID_REQUEST_ID:'유효한 작업 요청 ID가 필요합니다.', INVALID_CHARACTER_ID:'캐릭터 ID를 확인해 주세요.',
  INVALID_PROMPT:'프롬프트는 1~800자로 작성해 주세요.', INVALID_SEED:'시드는 0~4294967295 정수여야 합니다.',
  INVALID_QUALITY:'품질은 standard 또는 high여야 합니다.', INVALID_HEIGHT:'캐릭터 키는 1.0~2.3 m여야 합니다.',
  INVALID_RETRY_FLAG:'이미지 재생성 허용 여부를 명시해 주세요.', NOT_FOUND:'AWS 작업을 찾지 못했습니다.',
  IDEMPOTENCY_CONFLICT:'같은 요청 ID가 다른 생성 조건에 사용되었습니다. 기존 작업 기록을 확인해 주세요.',
  IMAGE_RETRY_REQUIRES_OPT_IN:'저장된 이미지가 없어 유료 이미지 재생성 허용이 필요합니다.',
  NOT_RETRYABLE:'현재 상태에서는 재시도할 수 없습니다. 먼저 작업 상태를 확인해 주세요.',
  RETRY_CONFLICT:'작업 상태가 바뀌었습니다. 최신 상태를 확인해 주세요.',
  MODEL_NOT_READY:'실제 GLB가 아직 완료되지 않았습니다.',
  ENQUEUE_PENDING:'작업은 저장됐지만 큐 접수가 확인되지 않았습니다. 같은 요청 ID로 다시 연결해 주세요.',
  ENQUEUE_ACK_PENDING:'큐 접수 결과를 확인 중입니다. 같은 요청 ID로 상태를 복구해 주세요.',
  UNAUTHORIZED:'서버의 AWS worker 인증 설정을 확인해 주세요.',
};

export class PipelineError extends Error {
  constructor(message, {status=502,code='PIPELINE_ERROR',unknown=false,retryAfter}={}) {
    super(message); this.name='PipelineError'; this.status=status; this.code=code;
    this.unknown=unknown; this.retryAfter=retryAfter;
  }
}

function fail(message,status=400,code='INVALID_REQUEST') { throw new PipelineError(message,{status,code}); }
function urlWithoutCredentials(value) {
  let url; try { url=new URL(value); } catch { fail('서버의 AWS 연결 URL 설정이 올바르지 않습니다.',503,'INVALID_CONFIGURATION'); }
  if (url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443'))
    fail('HTTPS AWS 연결만 허용됩니다.',503,'INVALID_CONFIGURATION');
  return url;
}

export function readPipelineConfig(environment={}) {
  const value=environment.AWS_WORKER_URL, token=environment.AWS_WORKER_TOKEN;
  if (typeof value!=='string' || typeof token!=='string' || !value || !token)
    fail('AWS worker 서버 연결이 아직 설정되지 않았습니다.',503,'NOT_CONFIGURED');
  const url=urlWithoutCredentials(value.trim());
  if (!WORKER_HOST.test(url.hostname) || url.search || url.hash || !/^\/(?:[A-Za-z0-9_-]+\/?)?$/.test(url.pathname))
    fail('고정 AWS API Gateway 엔드포인트를 설정해 주세요.',503,'INVALID_CONFIGURATION');
  if (token.length<24 || token.length>4096 || /[\r\n]/.test(token))
    fail('서버의 AWS worker 인증 설정을 확인해 주세요.',503,'INVALID_CONFIGURATION');
  return {baseURL:url.href.replace(/\/$/,''),token};
}

export function isPipelineConfigured(environment) { try { readPipelineConfig(environment); return true; } catch { return false; } }
export function validateStudioRequest(request) {
  if (request.method!=='POST' || request.headers.get('x-crowd-request')!=='studio' ||
      request.headers.get('origin')!==new URL(request.url).origin)
    fail('허용되지 않는 요청입니다.',403,'FORBIDDEN');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    fail('JSON 요청이 필요합니다.',415,'JSON_REQUIRED');
}
export function validJobId(value) {
  if (typeof value!=='string' || !UUID.test(value)) fail('유효한 작업 요청 ID가 필요합니다.',400,'INVALID_REQUEST_ID');
  return value.toLowerCase();
}

export function validateGenerate(input) {
  const requestId=validJobId(input?.requestId), characterId=input.characterId??requestId;
  if (typeof characterId!=='string' || characterId.length<1 || characterId.length>100)
    fail(PUBLIC_MESSAGES.INVALID_CHARACTER_ID,400,'INVALID_CHARACTER_ID');
  if (typeof input.prompt!=='string' || [...input.prompt.trim()].length<1 || [...input.prompt.trim()].length>800)
    fail(PUBLIC_MESSAGES.INVALID_PROMPT,400,'INVALID_PROMPT');
  if (!Number.isInteger(input.seed) || input.seed<0 || input.seed>0xffffffff)
    fail(PUBLIC_MESSAGES.INVALID_SEED,400,'INVALID_SEED');
  if (!['standard','high'].includes(input.quality)) fail(PUBLIC_MESSAGES.INVALID_QUALITY,400,'INVALID_QUALITY');
  if (!Number.isFinite(input.heightMeters) || input.heightMeters<1 || input.heightMeters>2.3)
    fail(PUBLIC_MESSAGES.INVALID_HEIGHT,400,'INVALID_HEIGHT');
  return {requestId,characterId,prompt:input.prompt.trim(),seed:input.seed,quality:input.quality,heightMeters:input.heightMeters};
}

export function safeModelURL(value) {
  let url; try { url=new URL(value); } catch { fail('모델 다운로드 주소를 확인할 수 없습니다.',502,'INVALID_MODEL_URL'); }
  if (url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') || url.hash ||
      !S3_HOST.test(url.hostname) || url.hostname.includes('..') ||
      url.searchParams.get('X-Amz-Algorithm')!=='AWS4-HMAC-SHA256' ||
      !/^[0-9a-f]{64}$/i.test(url.searchParams.get('X-Amz-Signature')||''))
    fail('서명된 AWS S3 모델 주소만 허용됩니다.',502,'INVALID_MODEL_URL');
  return url;
}

function safeToken(value) { return typeof value==='string' && /^[A-Za-z0-9_-]{1,80}$/.test(value); }
function sanitizeJob(raw) {
  if (!raw || typeof raw!=='object' || !NATIVE_STATES.has(raw.state))
    fail('AWS worker의 작업 상태 응답을 확인할 수 없습니다.',502,'INVALID_WORKER_RESPONSE');
  const result={id:validJobId(raw.id),requestId:validJobId(raw.requestId??raw.id),state:raw.state};
  // Preserve the worker's enum; never convert an accepted/queued job to success.
  if (raw.status!==undefined) { if (raw.status!==raw.state) fail('AWS 작업 상태가 일치하지 않습니다.',502,'INVALID_WORKER_RESPONSE'); result.status=raw.status; }
  for (const field of ['characterId','stage','quality','enqueueState','imageRequestState'])
    if (typeof raw[field]==='string' && raw[field].length<=100) result[field]=raw[field];
  for (const field of ['progress','attempt','createdAt','updatedAt','startedAt','finishedAt','heightMeters','triangles'])
    if (Number.isFinite(raw[field])) result[field]=raw[field];
  for (const field of ['rigged','animated','allowImageRetryRequired'])
    if (typeof raw[field]==='boolean') result[field]=raw[field];
  if (raw.error && typeof raw.error==='object') {
    const code=safeToken(raw.error.code)?raw.error.code:'WORKER_JOB_FAILED';
    result.error={code,message:PUBLIC_MESSAGES[code]||'AWS worker 작업을 완료하지 못했습니다. 오류 코드와 단계로 서버 기록을 확인해 주세요.'};
    if (safeToken(raw.error.stage)) result.error.stage=raw.error.stage;
  }
  // Signed asset URLs and provider/debug fields remain on the server.
  result.hasImage=typeof raw.imageUrl==='string';
  return result;
}

function publicRemoteError(status,raw,paid,retryHeader) {
  const code=safeToken(raw?.error?.code)?raw.error.code:'WORKER_REQUEST_FAILED';
  const fallback=status===401||status===403?'서버의 AWS worker 인증 설정을 확인해 주세요.':status===429?'AWS 요청 한도에 도달했습니다. 잠시 후 다시 확인해 주세요.':'AWS worker 요청을 완료하지 못했습니다.';
  const delay=Number(retryHeader);
  return new PipelineError(PUBLIC_MESSAGES[code]||fallback,{status,code,unknown:paid&&status>=500,
    ...(Number.isFinite(delay)&&delay>0?{retryAfter:Math.min(delay,300)}:{})});
}

async function boundedGLBResponse(response,maxBytes) {
  const length=Number(response.headers.get('content-length'));
  if (length>maxBytes) fail('모델이 100 MB 다운로드 한도를 넘습니다.',413,'MODEL_TOO_LARGE');
  if (!response.body) fail('모델 파일을 읽지 못했습니다.',502,'INVALID_MODEL');
  const reader=response.body.getReader(), prefix=[]; let bytes=0;
  try {
    while (bytes<12) {
      const part=await reader.read();
      if (part.done) fail('GLB 헤더가 없는 응답입니다.',502,'INVALID_MODEL');
      bytes+=part.value.byteLength;
      if (bytes>maxBytes) fail('모델이 100 MB 다운로드 한도를 넘습니다.',413,'MODEL_TOO_LARGE');
      prefix.push(part.value);
    }
    const header=new Uint8Array(12); let offset=0;
    for (const part of prefix) { const copy=part.subarray(0,12-offset); header.set(copy,offset); offset+=copy.byteLength; if(offset===12) break; }
    const view=new DataView(header.buffer), declared=view.getUint32(8,true);
    if (view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2 || declared<20)
      fail('유효한 GLB 2.0 응답이 아닙니다.',502,'INVALID_MODEL');
    if (declared>maxBytes || bytes>declared) fail('모델 크기가 다운로드 한도 또는 GLB 헤더와 맞지 않습니다.',413,'MODEL_TOO_LARGE');
    const stream=new ReadableStream({
      start(controller) { for (const chunk of prefix) controller.enqueue(chunk); },
      async pull(controller) {
        try {
          const part=await reader.read();
          if (part.done) { if(bytes!==declared) throw new Error('Incomplete GLB stream.'); controller.close(); return; }
          bytes+=part.value.byteLength;
          if (bytes>maxBytes || bytes>declared) throw new Error('GLB stream exceeded its declared size.');
          controller.enqueue(part.value);
        } catch { await reader.cancel().catch(()=>{}); controller.error(new Error('모델 다운로드가 중단되었습니다. 파일을 다시 받아 주세요.')); }
      },
      cancel(reason) { return reader.cancel(reason); }
    });
    return new Response(stream,{headers:{'Content-Type':'model/gltf-binary','Content-Length':String(declared),'Content-Disposition':'attachment; filename="crowd-character.glb"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch (error) { await reader.cancel().catch(()=>{}); throw error; }
}

export function createPipeline({environment={},fetchImpl=fetch,timeoutMs=45000,downloadTimeoutMs=90000,maxModelBytes=MAX_MODEL_BYTES}={}) {
  const config=readPipelineConfig(environment);
  async function call(path,{method='GET',body}={}) {
    const paid=method==='POST'; let response;
    try {
      response=await fetchImpl(config.baseURL+path,{method,redirect:'error',credentials:'omit',
        headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json','Accept':'application/json'},
        ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeoutMs)});
    } catch { throw new PipelineError('AWS worker 응답을 받지 못했습니다. 같은 요청 ID의 상태를 확인해 주세요.',{code:'WORKER_UNREACHABLE',unknown:paid}); }
    let raw;
    try { const text=await response.text(); if(text.length>131072) throw new Error(); raw=JSON.parse(text); }
    catch { throw new PipelineError('AWS worker 응답 형식을 확인할 수 없습니다.',{code:'INVALID_WORKER_RESPONSE',unknown:paid}); }
    if (!response.ok) throw publicRemoteError(response.status,raw,paid,response.headers.get('Retry-After'));
    return raw;
  }
  return {
    async verify() {
      const raw=await call('/health');
      if (raw?.ok!==true || raw.service!=='static-character-jobs') fail('AWS worker 준비 상태를 확인할 수 없습니다.',502,'INVALID_HEALTH_RESPONSE');
      return {ok:raw.ok,service:raw.service,rigged:raw.rigged===true,animated:raw.animated===true};
    },
    async generate(input) { return sanitizeJob(await call('/jobs',{method:'POST',body:validateGenerate(input)})); },
    async status(id) { return sanitizeJob(await call('/jobs/'+validJobId(id))); },
    async retry(id,allowImageRetry) {
      if (typeof allowImageRetry!=='boolean') fail(PUBLIC_MESSAGES.INVALID_RETRY_FLAG,400,'INVALID_RETRY_FLAG');
      return sanitizeJob(await call('/jobs/'+validJobId(id)+'/retry',{method:'POST',body:{allowImageRetry}}));
    },
    async download(id) {
      const raw=await call('/jobs/'+validJobId(id)+'/model');
      if (raw.format!=='glb') fail('GLB 모델 응답이 아닙니다.',502,'INVALID_MODEL');
      const url=safeModelURL(raw.url); let response;
      try { response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'model/gltf-binary, application/octet-stream'},signal:AbortSignal.timeout(downloadTimeoutMs)}); }
      catch { throw new PipelineError('S3 모델 다운로드에 실패했습니다.',{code:'MODEL_DOWNLOAD_FAILED'}); }
      if (!response.ok) fail('S3 모델 다운로드에 실패했습니다. 작업 상태를 다시 확인해 주세요.',502,'MODEL_DOWNLOAD_FAILED');
      return boundedGLBResponse(response,maxModelBytes);
    }
  };
}

export function publicPipelineError(error) {
  if (error instanceof PipelineError) return {status:error.status,body:{error:error.message,code:error.code,unknown:error.unknown,...(error.retryAfter?{retryAfter:error.retryAfter}:{})}};
  return {status:502,body:{error:'AWS 요청을 처리하지 못했습니다.',code:'INTERNAL_PROXY_ERROR',unknown:false}};
}
