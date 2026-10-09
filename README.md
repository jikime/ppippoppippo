# Crowd Studio · 군중 3D 에셋 생성

장소별로 다양한 사람의 외형·복장을 설계하고, AWS와 OpenAI로 실제 GLB를 생성하는 독립 웹 도구입니다. 이번 변경 범위는 군중 에셋 생성·검수·내보내기입니다. 페르소나는 이후 캐릭터 ID에 연결할 전제로 두었습니다.

## 기능

- **11개 장소**: 미국 야구장, AWS 행사장, 학교, 인스파이어 아레나, 건설현장, 공항, 해커톤, 콘서트, 대중교통, 오피스, 재난 대응.
- 랜덤 시드·인원·의상 다양성으로 최대 10,000명 명세 생성. 같은 시드는 같은 명세를 재현합니다.
- OpenAI 단일 인물 이미지 → AWS GPU의 원본 Microsoft TRELLIS → 텍스처 포함 정적 GLB.
- 3D 회전·확대 검수, 로컬 GLB 열기, 개별 GLB 다운로드, 완료 모델 ZIP과 캐릭터 명세 내보내기.
- UUID 기반 중복 접수 방지, DynamoDB 작업 기록, SQS 작업 큐, 불확실한 유료 이미지 요청의 자동 재시도 방지.
- 키를 가상 미터 단위로 정규화하고 Y-up·발바닥 원점으로 저장합니다. 실제 정면 방향은 검수가 필요합니다.

**현재 소스·로컬 빌드·모의 API를 검증했습니다. AWS 배포, OpenAI 유료 호출, GPU 추론은 아직 실행하지 않았습니다.** 11,000명 예제는 캐릭터 명세이며 3D 모델 11,000개가 아닙니다. 첫 생성 결과의 얼굴·손·뒷면·텍스처 품질을 별도로 확인해야 합니다. 출력은 정적 모델이며 골격·걷기 애니메이션·최적화 LOD 생성은 포함되지 않습니다.

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```sh
npm ci
npm run dev
```

`http://localhost:5173/`에서 명세 생성·선택·내보내기와 로컬 GLB 보기를 사용할 수 있습니다. 유료 생성은 AWS 배포와 연결 후 사용할 수 있습니다. 로컬 GLB 미리보기는 파일당 50MB까지 지원합니다.

```sh
npm run build
npm run preview
```

AWS 정적 웹 결과는 `dist/aws-web/`입니다.

## AWS 구성

```text
브라우저 ─ CloudFront ─ 비공개 S3 (웹 화면)
              └ /api/* ─ API Gateway ─ Lambda ─ DynamoDB
                                         └ SQS ─ EC2 GPU 작업자
                                                   ├ OpenAI 이미지 생성
                                                   ├ TRELLIS 3D 변환
                                                   └ 비공개 S3 (PNG/GLB/명세)
```

[배포 가이드](services/aws-asset-pipeline/DEPLOYMENT.md)와 [작업 API 문서](services/aws-asset-pipeline/README.md)를 따릅니다. CloudFormation은 API·DB·큐·버킷·CloudFront·IAM을 준비하며 GPU 인스턴스는 별도로 설정합니다. 리전·할당량·AMI·비용을 먼저 확인하세요.

OpenAI 키는 Secrets Manager, AWS 권한은 인스턴스 역할에 둡니다. 웹 연결창에는 배포 시 생성한 **Crowd Studio 앱 전용 운영자 토큰**만 입력합니다. 이 토큰은 탭 메모리에만 유지됩니다. IAM 액세스 키나 OpenAI 키를 웹·채팅·Git에 넣지 마세요. 현재 공유 운영자 토큰 방식이며, 다중 사용자 서비스로 운영하려면 개별 로그인·권한·감사 기록이 추가로 필요합니다.

OpenAI 이미지 사용량과 AWS GPU 실행 시간에 비용이 발생합니다. 탭을 닫거나 추적을 멈춰도 접수한 AWS 작업은 계속됩니다. GPU 자동 종료나 총비용 상한은 구현하지 않았으므로 사용 후 GPU를 중지하고 저장소 보관 정책을 관리하세요.

## 생성 결과의 계약

- GLB 2.0, 텍스처 포함, Y-up, 가상 미터 단위, 발바닥 원점.
- `standard`: 1K 텍스처, `high`: 2K 텍스처. 해상도 옵션은 인체 품질 보장이 아닙니다.
- 골격·애니메이션 없는 정적 메시. 별도로 보유한 GLB에 애니메이션 클립이 있으면 미리보기에서 재생할 수 있습니다.
- ZIP의 `character-manifest.json`에 캐릭터 ID, 프롬프트, 키, 생성 작업 ID, 검수 필요 여부를 기록합니다.
- 원거리 LOD·충돌체·리깅·행동 속성은 사용하는 3D 환경에서 별도 준비합니다.
- 11개 장소 프리셋은 캐릭터 구성입니다. 시설 도면이나 실측 공간을 생성한 것은 아닙니다.

AWS 현장 영상은 복장 등 공통 장면 특성만 참고했습니다. 촬영된 얼굴이나 원본 영상은 배포 파일에 포함하지 않았습니다. `public/style-reference.png`는 AI로 만든 2D 스타일 참고이며 실제 생성된 GLB의 모습이 아닙니다.

## 검증

```sh
npm run typecheck
npm test
npm run test:worker
npm run build
```

명세 11,000개의 고유 ID·시드 재현·프롬프트 길이·연령 범위, 16개 JavaScript 모의 API 검사, 12개 Python 작업 검사, 6개 CloudFront 라우팅 검사를 통과했습니다. 실제 생성이나 비용을 발생시키는 테스트는 하지 않았습니다. 자세한 범위는 [검증 기록](VALIDATION.md)에 있습니다.

## 생성 모델의 사용 조건

[TRELLIS](https://github.com/microsoft/TRELLIS)의 상위 코드·모델은 MIT지만 일부 GPU 의존성에는 별도 비상업적 이용 조건이 있습니다. 이 구성 전체의 상업 이용 권한이 확보됐다고 주장하지 않습니다. 상업 서비스 전환 전 해당 의존성을 교체하거나 권한을 확인해야 합니다. 공식 출처와 기술 조건은 [작업자 문서](services/aws-asset-pipeline/README.md)에 정리했습니다.
