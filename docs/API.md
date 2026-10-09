# API 문서: 운영 판단과 실시간 영상 탐지

2026-10-09 기준. 이 문서는 **현재 저장소에 구현된 API**와 **앞으로 구현할 맥미니 추론 API 계약 초안**을 구분합니다. 실시간 영상 서버를 구현하거나 배포한 문서가 아닙니다.

## 1. 무엇이 현재 동작하나요?

| 구분 | 상태 | 입력과 출력 |
| --- | --- | --- |
| 운영 판단 API | 저장소에 구현됨 | 3D 시뮬레이션 상태 → OpenAI의 운영 조치 선택 |
| 화재·연기 모델 | 별도 모델 작업에서 학습 및 Mac mini 추론 확인 | 이미지 → 화재·연기 박스 |
| 낙상 모델 | 별도 모델 작업에서 학습 및 Mac mini 추론 확인 | 약 2초의 자세 변화 → 낙상 점수 |
| 영상 REST / WebSocket API | **설계 초안, 미구현** | 아래 3절의 인터페이스로 연결 예정 |
| 총기 탐지·현장 알림·외부 연락 | 미연결 | 현재 모델이나 API가 지원한다고 가정하지 않음 |

현재 웹의 **가상 CCTV는 3D 장면을 다시 렌더링한 화면**입니다. 웹캠이나 실물 CCTV 영상이 아닙니다. 모델 파일과 별도 추론 스크립트는 이 저장소에 포함되어 있지 않습니다.

## 2. 현재 구현된 운영 판단 API

개발 서버 기준 주소는 `http://localhost:5173`입니다. `npm run preview -- --port 4173`으로 실행하면 `http://localhost:4173`을 사용합니다. 서버가 실행 중일 때만 아래 경로가 동작합니다.

구현: `server/decisions.ts`, `src/decision/contract.ts`. 자세한 모델 요청 설명은 [decisions.md](decisions.md)를 참고하세요.

### GET /api/decisions/status

키 설정 여부를 확인합니다. OpenAI에 요청하지 않으며 키 값은 반환하지 않습니다. `configured: true`는 키가 설정됐다는 뜻이며 실제 인증 성공이나 API 사용 권한을 증명하지 않습니다.

```sh
curl http://localhost:5173/api/decisions/status
```

응답 예시:

```json
{"configured": false, "model": "gpt-6-luna"}
```

### POST /api/decisions/evaluate

`Content-Type: application/json`으로 현재 상황을 보냅니다. 서버가 OpenAI에 요청하므로 실제 호출에는 유효한 서버 키와 API 사용 권한이 필요하고 사용량이 발생할 수 있습니다.

| 필드 | 형식 및 범위 | 의미 |
| --- | --- | --- |
| `phase` | 아래 단계 ID 또는 `null` | 현재 행사 단계 |
| `minute` | 숫자, 0–1260 | 자정부터 경과한 행사 시각, 10:00은 600 |
| `inside`, `moving`, `waiting`, `blocked`, `expected` | 각각 숫자, 0–120 | 시뮬레이션 집계값. 현재 검증 범위이며 대규모 행사 인원 API가 아님 |
| `guidance` | boolean | 안내 조치 활성 여부 |
| `exits` | 정확히 3개, ID는 A·B·C 순서 | 각 항목에 `id`, boolean `open`, 0–120 숫자 `queue` |
| `note` | 문자열, 최대 400자 | 운영자 메모. 빈 문자열 가능 |

단계 ID: `checkin`, `recap`, `aws`, `build_am`, `lunch`, `build_pm`, `review`, `tracks`, `results`, `final`, `closing`.

요청 예시 — `decision-request.json`이라는 파일로 저장할 수 있습니다:

```json
{
  "phase": "lunch",
  "minute": 730,
  "inside": 120,
  "moving": 30,
  "waiting": 12,
  "blocked": 0,
  "expected": 120,
  "guidance": false,
  "exits": [
    {"id": "A", "open": true, "queue": 4},
    {"id": "B", "open": true, "queue": 5},
    {"id": "C", "open": true, "queue": 3}
  ],
  "note": "배식 동선의 대기를 분산하고 싶습니다."
}
```

```sh
curl -X POST http://localhost:5173/api/decisions/evaluate \
  -H 'Content-Type: application/json' \
  --data-binary @decision-request.json
```

PowerShell에서는 `curl` 별칭 대신 `curl.exe`를 사용하고 위 명령을 한 줄로 입력하면 됩니다.

응답 형식 예시 — 아래 값은 설명용이며 실제 호출 결과가 아닙니다:

```json
{
  "source": "openai-decisions",
  "model": "gpt-6-luna",
  "action": "stagger_meals",
  "confidence": 0.72,
  "probabilities": {
    "observe": 0.12,
    "dispatch_guides": 0.18,
    "stagger_meals": 0.60,
    "focus_session": 0.04,
    "submission_help": 0.03,
    "guide_departure": 0.03
  },
  "elapsedMs": 450,
  "usage": {"input_tokens": 300, "output_tokens": 30}
}
```

`confidence`와 `probabilities`는 서로 다른 값입니다. 어느 값도 실제 재난 발생 확률이나 안전 인증 점수가 아닙니다. `model`은 실제 반환된 모델 식별자이며 예시와 다를 수 있습니다.

조치: `observe`, `dispatch_guides`, `stagger_meals`, `focus_session`, `submission_help`, `guide_departure`. 단계별 허용 조건은 [decisions.md](decisions.md)에 있습니다.

**API 호출만으로 시뮬레이션이 바뀌지는 않습니다.** 브라우저가 제안을 받아 적용합니다. 현재 브라우저의 수동·자동 적용 모두 확신도 0.65 이상과 응답 유효 시점을 검사합니다. 자동 모드의 조치는 가상 인물에만 적용되며 실제 연락·대피 안내를 실행하지 않습니다.

### 오류와 제한

오류 본문 형식은 `{"error":"설명"}`입니다.

| HTTP | 원인 | 조치 |
| --- | --- | --- |
| 400 | 잘못된 JSON 또는 필드 형식 | 필수 필드·값 범위·출입구 순서 확인 |
| 403 | Origin의 host와 요청 Host가 다르거나 Origin이 잘못됨 | 같은 웹사이트 서버를 통해 요청 |
| 404 | 지원하지 않는 경로 또는 메서드 | 경로와 GET/POST 확인 |
| 413 | 요청 본문이 8192바이트 초과 | 메모와 본문 줄이기 |
| 415 | JSON Content-Type 아님 | `application/json` 설정 |
| 422 | 모델이 판단을 거절 | 현재 상태 유지, 상황 검토 |
| 429 | 서버가 처리 중이거나 직전 요청 후 2.5초 이내 | 이전 요청 완료 후 간격을 두고 재시도 |
| 502 | 외부 인증·한도·연결·15초 제한 시간·응답 검증 오류 | 반환 메시지에 따라 서버 설정 확인 |
| 503 | 서버 API 키 미설정 | `.env.local` 설정 후 재시작 |

요청 제한은 현재 서버 프로세스 전체에 적용됩니다. Origin 검사는 사용자 인증을 대신하지 않습니다. 현재 개발·미리보기 서버를 인터넷에 공개하는 운영 API로 취급하지 않습니다. `dist/`만 정적 배포하면 이 Node API는 실행되지 않습니다.

## 3. 맥미니 실시간 탐지 API: 미구현 계약 초안

다음 경로·메시지·설정 이름은 **팀이 구현할 때 사용할 초안**입니다. 아직 호출 가능한 URL이나 실행 명령이 없습니다.

```text
웹캠 → 브라우저 → 웹 서버의 인증된 영상 연결 → Mac mini 추론 서버
                                                  ↓
관제 화면 ← 탐지 결과 ← 이벤트 검증·중복 제거 ← 화재 / 낙상 모델
                         ↓
                 OpenAI 대응안 → 관리자 승인 → 외부 대응
```

브라우저에는 Mac mini의 내부 주소나 서버용 인증키를 전달하지 않습니다. 웹 서버가 인증된 비공개 연결로 추론 서버에 접근합니다. 현재 Decisions API는 영상 위험 이벤트를 받는 계약이 아니므로 별도 이벤트 변환·대응안 계층이 필요합니다.

### 제안 경로

| 경로 | 전송 | 용도 |
| --- | --- | --- |
| `GET /health` | HTTP | 준비된 모델·장치·버전 확인. 서버 생존과 모델 준비 상태 구분 |
| `POST /detect/fire` | multipart 파일 | 한 이미지의 화재·연기 추론 시험 |
| `POST /detect/fall` | multipart 영상 | 약 2초 이상 영상의 시간 구간 추론 시험 |
| `/ws/vision` | WebSocket | 실시간 프레임 수신·결과 반환 |

위 경로는 **맥미니 서버 기준**이며 기존 `/api/decisions/*`와 별개입니다. 웹 서버에서 노출할 프록시 경로는 구현 시 정해야 합니다.

### WebSocket 메시지 흐름

1. 웹 서버가 사용자·카메라 접근 권한을 확인하고 연결을 중계합니다. 예시 메시지에는 실제 인증키를 넣지 않습니다.
2. 연결마다 하나의 카메라를 등록합니다. 초기 목표는 카메라 1대, 모델 입력 초당 4프레임입니다.
3. 각 프레임은 **메타데이터 JSON 한 개, 이어서 JPEG 바이너리 한 개**로 보냅니다. 두 메시지 사이에 다른 프레임을 끼워 넣지 않습니다.
4. 서버가 대응하는 `frame_id`와 촬영 시각을 결과에 돌려줍니다. 화면은 같은 프레임의 결과를 사용합니다.
5. 추론 모델은 서버 시작 시 로딩하고, 카메라별 낙상 기록은 연결 상태와 분리해 관리합니다.

등록 메시지 예시:

```json
{"type":"start","camera_id":"aws-demo-01","modes":["fire","fall"],"target_fps":4}
```

프레임 메타데이터 예시 — 다음 메시지는 JPEG 바이너리여야 합니다:

```json
{"type":"frame","camera_id":"aws-demo-01","frame_id":42,"capture_ms":10500,"width":1280,"height":720}
```

`capture_ms`는 이 카메라 세션 시작부터의 단조 증가 시간입니다. 새 세션은 시간 기준과 낙상 기록을 초기화합니다. 시각은 네트워크 도착 시간이 아니라 촬영 시각을 사용합니다.

결과 예시 — 아직 실행 결과가 아닌 설계용 값입니다:

```json
{
  "type": "result",
  "camera_id": "aws-demo-01",
  "frame_id": 42,
  "capture_ms": 10500,
  "image_size": {"width": 1280, "height": 720},
  "fire": {
    "status": "scored",
    "detections": [
      {"class": "smoke", "confidence": 0.78, "xyxy": [100, 80, 260, 310]}
    ]
  },
  "fall": {"status": "warming_up", "score": null, "threshold": null, "alert": null},
  "inference_ms": 35
}
```

박스 좌표는 반환된 `image_size`의 픽셀 기준 `[왼쪽, 위, 오른쪽, 아래]`입니다. UI에서 확대·축소하면 좌표도 같은 비율로 바꿉니다. `confidence`·낙상 `score`를 검증된 실제 사고 확률로 표시하지 않습니다.

낙상 `status`는 `warming_up`, `insufficient_pose`, `scored`, `reset`으로 제안합니다. 준비 중·자세 부족·기록 초기화 상태의 `alert`는 `null`로 두어 정상 판정과 구분합니다. `scored`일 때만 점수와 모델 파일에 저장된 임계값을 반환합니다.

### 실시간 상태 처리와 현재 모델 제약

- 낙상은 4fps에서 최근 8프레임의 특징으로 판단합니다. 첫 약 2초 이후에는 새 프레임마다 최근 구간을 갱신합니다.
- 현재 모델은 화면 속 한 사람의 박스를 이어서 추적하는 파일럿입니다. 여러 사람의 낙상을 각각 판정하려면 사람별 추적 ID와 기록이 필요합니다. 사람이 바뀌면 같은 사람의 동작처럼 기록을 이어 붙이지 않습니다.
- 낙상용 프레임은 250ms 간격을 목표로 합니다. 크게 벌어진 간격·사람 변경·연결 복구 시에는 기록을 초기화하며, 허용 간격은 구현·테스트로 정합니다.
- 첫 초안은 프레임당 응답을 받고 다음 프레임을 보내는 방식으로 대기열을 제한합니다. 처리가 250ms보다 느려지면 속도를 낮췄다고 표시하고, 이를 모델의 정상 입력 주기로 간주하지 않습니다.
- 모델 입력을 원래 카메라보다 고해상도로 늘려도 잃어버린 자세 정보는 복구되지 않습니다. 학습 당시 Pose 추론 크기는 1280, 화재 추론 크기는 640이었으며 전송 해상도 변화는 별도 검증합니다.
- 모델 추론은 WebSocket 수신 루프를 막지 않는 제한된 작업 큐에서 처리합니다. 여러 연결이 같은 모델 객체를 동시에 수정하지 않도록 실행을 직렬화하거나 안전한 실행 단위를 둡니다.
- 연결 끊김·프레임 정지·모델 오류는 관제 화면에 표시합니다. 결과가 없다는 이유로 안전하다고 표시하지 않습니다.
- 영상 매 프레임을 OpenAI에 보내지 않습니다. 비전 모델의 탐지를 시간 조건·중복 제거로 묶은 위험 이벤트가 생길 때 대응안을 요청합니다.
- 실제 전화·문자·개인별 대피 안내는 관리자 승인 뒤 실행하도록 별도로 구현합니다. 현재 저장소의 가상 자동 대응과 다릅니다.

### 구현 후 확인할 항목

카메라 1대에서 실제 프레임 수신, 화재·낙상 동시 추론, 카메라 기록 분리, 끊김·재접속, 잘못된 JPEG·큰 요청 거절, 인증 실패, 오래된 프레임 처리, 관리자 승인 경계를 확인합니다. 촬영부터 화면 표시까지의 지연 p50/p95와 유효 처리 fps를 측정해야 하며, 모델 한 프레임의 추론 시간만으로 실시간 지원을 선언하지 않습니다.

## 4. 참고

- [현재 실행 및 사용방법](USAGE.md)
- [현재 운영 판단 상세](decisions.md)
- [FastAPI WebSocket 공식 문서](https://fastapi.tiangolo.com/advanced/websockets/)
- [FastAPI 파일 업로드 공식 문서](https://fastapi.tiangolo.com/tutorial/request-files/)
- [브라우저 카메라 접근과 보안 환경](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
