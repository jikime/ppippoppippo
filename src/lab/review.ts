import { DecisionRefusal } from '../decision/contract.ts';
import { FINDINGS, RULES } from './model.ts';
import type { Finding, Rule } from './model.ts';

export interface ReviewContext {completed:number;seed:number;findings:Finding[]}
export interface ReviewResult {rule:Rule|'investigate';confidence:number;model:string;elapsedMs:number;source:'openai-decisions'}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const count=(v:unknown,max=1200000):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=max;
export function parseReview(value:unknown):ReviewContext {
  if(!object(value)||!count(value.completed,10000)||!value.completed||!count(value.seed,0xffffffff)||!Array.isArray(value.findings)||value.findings.length>7)throw new Error('검토 근거 형식 오류');
  const completed=value.completed,seen=new Set<string>();
  const findings=value.findings.map(v=>{
    if(!object(v)||typeof v.key!=='string'||!Object.hasOwn(FINDINGS,v.key)||seen.has(v.key)||
      !count(v.worlds,completed)||!count(v.afterWorlds,completed)||!count(v.regressedWorlds,completed)||!count(v.peak,120)||!count(v.total,completed*120)||!count(v.afterTotal,completed*120)||!count(v.score,100)||!count(v.worldIndex,9999)||(v.evidenceVariant!=='before'&&v.evidenceVariant!=='after'))throw new Error('검토 근거 형식 오류');
    seen.add(v.key);
    return {key:v.key,worlds:v.worlds,afterWorlds:v.afterWorlds,regressedWorlds:v.regressedWorlds,peak:v.peak,total:v.total,afterTotal:v.afterTotal,score:v.score,worldIndex:v.worldIndex,evidenceVariant:v.evidenceVariant} as Finding;
  });
  return {completed,seed:value.seed,findings};
}
export function reviewRequest(context:ReviewContext){
  return {model:'gpt-6-luna',input:JSON.stringify({
    source:'Synthetic event/queue experiments, unvalidated planning model. No mortality, clinical, smoke physics or real-world probability claims.',
    ...context,findings:context.findings.map(f=>({...f,description:FINDINGS[f.key].meaning,related_rule:FINDINGS[f.key].rule})),
  }),questions:[{name:'review_priority',type:'choice',instructions:'Choose which manual clause a safety manager should REVIEW FIRST based only on measured synthetic evidence, severity, frequency within this sample, before/after changes and regressions. This is a recommendation for human review, never authorization for live actions or safety certification. Choose investigate if evidence is insufficient, contradictory or regressions deserve further testing. Do not infer real casualties or real-world risk probability.',
    choices:[...Object.entries(RULES).map(([value,rule])=>({value,description:rule.detail})),{value:'investigate',description:'Run additional targeted experiments and inspect evidence before selecting a manual change.'}]}]};
}
export function parseReviewResult(value:unknown,elapsedMs:number):ReviewResult {
  if(!object(value)||typeof value.model!=='string'||!Array.isArray(value.answers)||value.answers.length!==1)throw new Error('검토 응답 오류');
  const a=value.answers[0];
  if(!object(a)||a.name!=='review_priority')throw new Error('검토 질문 불일치');
  if(a.type==='refusal')throw new DecisionRefusal();
  const choices=[...Object.keys(RULES),'investigate'];
  if(a.type!=='choice'||typeof a.choice!=='string'||!choices.includes(a.choice)||typeof a.confidence!=='number'||!Number.isFinite(a.confidence)||a.confidence<0||a.confidence>1||!Array.isArray(a.probabilities))throw new Error('검토 값 오류');
  const seen=new Set<string>();let total=0;
  for(const p of a.probabilities){
    if(!object(p)||typeof p.value!=='string'||!choices.includes(p.value)||seen.has(p.value)||typeof p.probability!=='number'||!Number.isFinite(p.probability)||p.probability<0||p.probability>1)throw new Error('확률 분포 오류');
    seen.add(p.value);total+=p.probability;
  }
  if(seen.size!==choices.length||Math.abs(total-1)>.015)throw new Error('확률 분포 오류');
  return {rule:a.choice as ReviewResult['rule'],confidence:a.confidence,model:value.model,elapsedMs,source:'openai-decisions'};
}
