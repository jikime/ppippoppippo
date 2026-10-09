# OpenAI Decisions · 행사 운영 판단

행사 일정과 3D 시뮬레이션 상태를 읽고 다음 운영 조치를 선택합니다. [OpenAI Decisions API](https://developers.openai.com/api/docs/guides/decisions)의 `choice` 질문을 사용하며, 응답 형식은 [공식 API 명세](https://developers.openai.com/api/reference/resources/decisions/methods/create)를 따릅니다.

## 설정

프로젝트 루트의 `.env.local`에 다음 환경변수를 설정한 뒤 개발 또는 미리보기 서버를 시작합니다. 실행 중에 키를 바꾸면 서버를 다시 시작합니다.

```dotenv
OPENAI_API_KEY=발급받은_API_키
```

| 항목 | 값 |
| --- | --- |
| 외부 API | `POST https://api.openai.com/v1/decisions` |
| 모델 | `gpt-6-luna` |
| 서버 인증 | `Authorization: Bearer …` |
| 앱 상태 확인 | `GET /api/decisions/status` |
| 앱 판단 요청 | `POST /api/decisions/evaluate` |
| 요청 제한 | 동시 1건, 최소 2.5초 간격 |
| 외부 요청 제한 시간 | 15초 |

키는 Vite의 Node 서버에서 읽습니다. `VITE_` 접두사를 붙이지 않으며, 브라우저 응답·번들·Git에는 포함하지 않습니다. API 프록시는 개발 서버와 `npm run preview`에서 동작합니다. 정적 파일만 배포하는 경우 서버 API를 별도로 배포해야 합니다.

## 판단 흐름

1. 브라우저에서 행사 단계·시각, 체류·이동·대기 인원, 출입구 상태, 최대 400자의 운영 메모를 수집합니다.
2. 서버가 허용된 필드만 추출하고 행사 설명과 적용 가능한 조치를 추가합니다.
3. 상황을 JSON 문자열로 직렬화해 `input`에 넣습니다. `questions` 배열에는 `name: "action"`, `type: "choice"`인 질문 한 개를 넣고 `choices`에 조치별 `value`와 `description`을 제공합니다.
4. 응답의 `answers` 배열에서 질문 이름, 선택한 조치, `confidence`, 조치별 `probabilities`를 검증합니다. 중복·누락된 확률, 유효 범위를 벗어난 값, 모델의 `refusal`은 적용하지 않습니다.
5. 브라우저가 현재 행사 단계와 응답의 시점을 다시 확인한 뒤 운영자가 선택한 제안을 적용합니다. 자동 대응을 켠 경우 조건을 충족한 조치를 자동으로 적용합니다.

## 조치와 적용 범위

| 조치 | 3D 시뮬레이션 동작 | 적용 범위 |
| --- | --- | --- |
| `observe` | 현재 계획 유지 | 모든 단계 |
| `dispatch_guides` | 운영요원을 안내 위치에 배치 | 모든 단계 |
| `stagger_meals` | 식사 인원을 나누어 이동 | 점심·1차 발표 심사 |
| `focus_session` | 발표 청취 중심으로 행동 전환 | 안내·AWS 세션·발표·결선 발표 |
| `submission_help` | 운영요원이 제출물·발표 상태 점검 | 17:00–17:10 |
| `guide_departure` | 운영요원이 퇴장 동선 안내 | 시연의 20:50 이후 퇴장 구간 |

자동 대응은 행사 단계와 마지막 시상·사진·퇴장 구간이 바뀔 때 판단합니다. 상황판을 닫아도 동작하며, 빠르게 장면을 전환하면 다음 호출까지 필요한 간격을 기다립니다. 응답의 확신도 65% 이상인 조치만 적용합니다. 이 임계값은 시연 설정이며 현장 안전성의 검증 기준이 아닙니다.

장면 초기화, 행사 단계 전환, 출입구·운영 상태 변경 또는 45초의 시뮬레이션 시간이 지난 경우 해당 응답을 다시 적용할 수 없습니다. 모델이 문을 직접 열거나 닫거나 행사 시간표를 변경하지 않습니다.

## 화면에 표시하는 값

모델이 선택한 조치, 모델 버전, 확신도, 조치별 확률, 입력 토큰 수와 서버에서 측정한 응답 시간을 표시합니다. 확신도와 확률 분포는 서로 다른 응답 필드이며 하나를 다른 값으로 추정하지 않습니다. 설명문을 추가로 생성하는 흐름은 사용하지 않습니다.

인물과 인원 수는 시뮬레이션 데이터입니다. 실제 영상·개인 식별 정보는 판단 요청에 포함하지 않습니다. API 오류나 거절은 상태 메시지로 표시하고 기존 운영을 유지합니다.

## 구현 위치

| 파일 | 역할 |
| --- | --- |
| `server/decisions.ts` | API 키·요청 제한·외부 호출·오류 처리 |
| `src/decision/contract.ts` | 상황 검증·공식 요청 형식·응답 검증 |
| `src/decision/store.ts` | 호출 상태·응답 유효 시점·적용 |
| `src/AgendaPanel.tsx` | 운영 메모·판단 결과·자동 대응 |
| `src/simulation/agenda.ts` | 행사 단계별 허용 조치 |
| `src/simulation/world.ts` | 실제 인물 행동에 조치 반영 |
