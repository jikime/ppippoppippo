import { FINDINGS, MODEL_VERSION, RULES, manualKey, rankFindings, regressionKeys } from './model';
import type { PairResult, RunConfig } from './model';
import type { Approval } from './store';
import type { ReviewResult } from './review';

export function report(config:RunConfig,results:PairResult[],status:string,approval:Approval|null,review:ReviewResult|null=null){
  return {
    schema:'crowdguard-experiment/1',model:MODEL_VERSION,createdAt:new Date().toISOString(),status,
    requestedWorlds:config.count,completedWorlds:results.length,completedSimulations:results.length*2,
    config,baselineVersion:manualKey(config.baseline),candidateVersion:manualKey(config.candidate),approval,review,
    regressedWorlds:results.filter(r=>regressionKeys(r).length>0).length,
    assumptions:['AWS 행사장 추정 치수와 통로 그래프, 합성 인물 120명','사고 조건은 실험 시작 시 고정; 연기·열·상해·질병·개인 간 충돌 물리 없음','무작위 분포와 처리량은 시연 가정; 현실 발생 확률 및 인명피해를 추정하지 않음','화재·정전은 출구 통과, 보안은 절차 수신 확인, 식사는 적합 배식을 완료 조건으로 사용','수신한 완결 쌍만 집계; 취소 시 계산 중인 쌍은 제외'],
    ranking:'심각도 계획 가중치 40 + 현행·개선 중 최대 영향 인원 25 + 합성 표본 내 최대 발견 빈도 20 + 재현 가능한 근거 15. maxQueue는 12명 초과분, 반응 지연은 60초 초과 관찰 기준. 개선 후 지표가 늘어난 세계 수는 별도 집계.',
    findings:rankFindings(results).map(f=>({...f,title:FINDINGS[f.key].title,interpretation:FINDINGS[f.key].meaning,suggestedClause:RULES[FINDINGS[f.key].rule].detail})),
    worlds:results,
  };
}
export function downloadReport(value:ReturnType<typeof report>){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`crowdguard-${value.config.seed}-${value.completedWorlds}-worlds.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
