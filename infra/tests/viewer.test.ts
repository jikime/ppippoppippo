import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

// Execute the actual function embedded in the deployment template.
const template=parse(readFileSync(new URL('../template.yaml',import.meta.url),'utf8'),{logLevel:'silent'});
const source=template.Resources.ViewerGate.Properties.FunctionCode;
const invoke=(uri:string,ip='203.0.113.10')=>runInNewContext(`${source}\nhandler(event)`,{event:{
  viewer:{ip},request:{uri,headers:{host:{value:'demo.cloudfront.net'},'x-viewer-host':{value:'forged.example'},'x-origin-verify':{value:'forged'}}},
}});

describe('CloudFront viewer access and routing',()=>{
  test('화면·영상·AI API를 외부 IPv4 및 IPv6 방문자에게 공개한다',()=>{
    for(const ip of ['203.0.113.12','198.51.100.42','2001:db8::42']) {
      for(const uri of ['/','/assets/app.js','/media/cctv/cam1.mp4','/api/decisions/evaluate']) {
        const request=invoke(uri,ip);
        expect(request.statusCode).toBeUndefined();
        expect(request.uri).toBe(uri==='/'?'/index.html':uri);
      }
    }
    expect(template.Parameters.AllowedViewerIps).toBeUndefined();
    expect(template.Resources.Distribution.Properties.DistributionConfig.IPV6Enabled).toBe(true);
  });
  test('브라우저에서 위조한 origin 헤더를 지우고 실제 Host로 덮어쓴다',()=>{
    const request=invoke('/api/decisions/evaluate');
    expect(request.uri).toBe('/api/decisions/evaluate');
    expect(request.headers['x-viewer-host'].value).toBe('demo.cloudfront.net');
    expect(request.headers['x-origin-verify']).toBeUndefined();
  });
  test('SPA 경로만 HTML로 보내고 API·WASM·영상 경로는 보존한다',()=>{
    for(const uri of ['/','/analytics','/dashboard/']) expect(invoke(uri).uri).toBe('/index.html');
    for(const uri of ['/api/decisions/status','/assets/navigation.wasm','/media/cctv/cam1.mp4']) expect(invoke(uri).uri).toBe(uri);
  });
  test('모든 배포 동작에 동일한 라우팅·헤더 보호 함수를 연결한다',()=>{
    const config=template.Resources.Distribution.Properties.DistributionConfig;
    for(const behavior of [config.DefaultCacheBehavior,...config.CacheBehaviors]) {
      expect(behavior.FunctionAssociations).toEqual([{EventType:'viewer-request',FunctionARN:'ViewerGate.FunctionARN'}]);
    }
    expect(template.Resources.ApiCachePolicy.Properties.CachePolicyConfig).toMatchObject({MinTTL:0,DefaultTTL:0,MaxTTL:0});
    for(const error of config.CustomErrorResponses) {
      expect(error.ErrorCachingMinTTL).toBe(0);
      expect(error.ResponsePagePath).toBeUndefined();
      expect(error.ResponseCode).toBeUndefined();
    }
  });
});
