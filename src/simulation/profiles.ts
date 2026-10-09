import { SEATS } from './layout';
import type { Role } from './world';

// All attributes are fictional experiment inputs, independent of photographed people.
export function randomSource(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let n = Math.imul(value ^ value >>> 15, value | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
export interface Persona {
  id: string; ordinal: number; name: string; role: Role; job: string; team: string; objective: string;
  walkSpeed: number; reactionSeconds: number; familiarity: number; needsAssistance: boolean;
  visualNotice: boolean; companion: boolean; allergy: 'none' | 'nuts' | 'milk';
}
const surnames = ['이','김','박','최','정','한','윤','서','강','조'];
const names = ['현서','도윤','지우','서연','수현','민재','하린','지호','유진','서준','예원','정우'];
const jobs = ['백엔드 개발자','프론트엔드 개발자','AI 엔지니어','클라우드 엔지니어','프로덕트 디자이너','기획자'];
const projects = ['서버 응답 시간 개선','접근 가능한 행사 안내','물류 흐름 예측','문서 탐색 도우미','탄소 배출 관측','실시간 자막','안전한 이동 안내','팀 협업 도구','개인화 학습','운영 자동화','영상 이벤트 분석','식사 정보 안내','시설 유지보수','고객 지원 도우미','데이터 품질 점검','현장 번역','이상 징후 관측','자원 사용 최적화'];
export function persona(ordinal: number, seed = 20261009): Persona {
  const r = randomSource((seed ^ Math.imul(ordinal + 1, 2654435761)) >>> 0);
  const role: Role = ordinal < 108 ? 'participant' : ordinal < 111 ? 'operator' : ordinal < 113 ? 'paramedic' : ordinal < 119 ? 'judge' : 'host';
  const seat = SEATS[(ordinal * 37) % 108];
  const teamIndex = Number(seat.table.slice(1)) - 1;
  const needsAssistance = r() < .12, visualNotice = r() < .18, companion = r() < .26;
  const allergyDraw = r();
  return {
    id: ordinal < 108 ? `P${String(ordinal+1).padStart(3,'0')}` : ordinal < 111 ? `OP${ordinal-107}` : ordinal < 113 ? `MED${ordinal-110}` : ordinal < 119 ? `J${ordinal-112}` : 'HOST',
    ordinal, name: surnames[ordinal % 10] + names[Math.floor(ordinal / 10)], role,
    job: role === 'participant' ? jobs[(ordinal * 37 % 108) % 6] : role === 'operator' ? '현장 운영 담당' : role === 'paramedic' ? '현장 응급구조사' : role === 'judge' ? '기술 심사위원' : '행사 진행자',
    team: role === 'participant' ? `팀 ${String(teamIndex+1).padStart(2,'0')}` : role === 'operator' ? '운영팀' : role === 'paramedic' ? '응급지원팀' : role === 'judge' ? '심사팀' : '행사 진행팀',
    objective: role === 'participant' ? `${projects[teamIndex]} 프로토타입을 완성하고 팀 발표에 참여한다.` : role === 'operator' ? '담당 구역의 요청을 확인하고 참가자의 이동과 행사 운영을 지원한다.' : role === 'paramedic' ? '현장을 순찰하며 응급지원 요청에 대비하고 이동 보조를 담당한다.' : role === 'judge' ? '팀별 결과물을 검토하고 발표 심사에 참여한다.' : '세션 진행과 시간 안내를 담당한다.',
    walkSpeed: Math.round((needsAssistance ? .48+r()*.28 : .9+r()*.5)*100)/100,
    reactionSeconds: Math.round(4+r()*25), familiarity: Math.round(r()*100)/100,
    needsAssistance, visualNotice, companion, allergy: allergyDraw < .09 ? 'nuts' : allergyDraw < .17 ? 'milk' : 'none',
  };
}
export const allergyName = {none:'없음',nuts:'견과류',milk:'우유'};
