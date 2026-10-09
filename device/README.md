# Tuya 디바이스 위험 경고 화면

ESP32-S3의 7개 LED·한국어 스피커 경고는 [LED·음성 보드 안내](esp32/README.md)에 있습니다. `npm run device:beacon`을 별도로 실행하면 Tuya 화면과 같은 경고를 함께 수신하며 두 장치의 연결 상태를 각각 확인할 수 있습니다.

JEONJO 관제 화면의 경고를 USB로 연결된 Tuya T5AI 보드의 320×480 LCD에 표시합니다. 보드에는 한국어 안내 문구와 터치 확인 버튼이 있는 전용 펌웨어를 설치합니다. 이 펌웨어를 사용하는 동안 기존 TClaw 음성 대화 기능은 실행되지 않으며, 원본 플래시 백업으로 복원할 수 있습니다.

현재 입력은 **시뮬레이션 상태와 사용자가 누른 시험 경고**입니다. 화재·낙상·위험 물체의 실제 영상 감지는 아직 연결하지 않았습니다. 경고 화면에도 출처를 표시합니다.

## 실행

프로젝트 루트에서 관제 서버와 USB 브리지를 각각 실행합니다.

```sh
npm run dev
```

```sh
python3 -m venv device/.tools/venv
device/.tools/venv/bin/pip install -r device/requirements.txt
device/.tools/venv/bin/python device/bridge.py
```

이미 현재 Python 환경에 pyserial이 설치되어 있다면 `npm run device:bridge`로 실행할 수 있습니다. 브리지를 끌 때는 `Ctrl+C`를 누릅니다.

1. 같은 맥에서 `http://localhost:5173`을 엽니다. 한 관제 창만 디바이스 송신자가 됩니다.
2. 상단 **디바이스 알림** 메뉴를 선택합니다.
3. **디바이스 응답 확인**이 표시되는지 확인합니다. USB 포트가 존재하는 것만으로는 연결 성공으로 표시하지 않습니다.
4. 시험 위치와 **화재 의심 경고** 등을 선택하면 실제 보드에도 시험 경고가 표시됩니다. **시험 경고 모두 해제**로 시험을 종료합니다.
5. **공간 관제**에서 출입구를 통제하면 시뮬레이션 경고가 자동으로 전달됩니다.

확인한 장치의 명령 포트는 `/dev/cu.usbmodem5AAE1657771`, 115200 baud입니다. 끝 번호 `3`은 디버그 로그 포트입니다. 자동 검색이 어려우면 지정합니다.

```sh
npm run device:bridge -- --port /dev/cu.usbmodem5AAE1657771
npm run device:bridge -- --dry-run
```

브리지는 localhost 서버만 사용합니다. API 키는 기존 `.env.local`에서 서버가 읽으며, USB 메시지나 펌웨어에 포함하지 않습니다. 행사 운영 판단은 기존 [OpenAI Decisions API 연결](../docs/decisions.md)을 사용합니다.

## 경고 조건과 표시

| 경고 | 자동 표시 조건 또는 입력 |
| --- | --- |
| 출입구 통제 | A·B·C 중 닫힌 출입구가 있을 때 즉시 |
| 모든 출입구 통제 | 내부 인원이 있고 세 출입구가 모두 닫혔을 때 즉시 |
| 이동 정체 | 대기 13명 이상이 5초 지속되면 진입, 8명 이하가 5초 지속되면 해제 |
| 이동 경로 확인 | 이동 불가 인원이 3초 이상 유지될 때 |
| 화재·낙상·응급 도움·위험 물체 | 디바이스 알림 패널의 시험 버튼 |

숫자와 지속 시간은 현재 시뮬레이션 시연용 기준입니다. 화면에는 가장 높은 우선순위의 경고 하나와 전체 경고 수를 표시합니다. 순서는 화재, 위험 물체, 전체 출입구 통제, 응급 도움, 낙상, 경로 막힘, 정체, 개별 출입구 통제입니다.

화면 상단 이름은 **JEONJO**, 배경은 모든 상태에서 순수 검정(`#000000`)입니다. 위험은 원색 빨강(`#FF0000`), 주의는 노랑(`#FFFF00`), 수신된 경고 없음은 초록(`#00FF00`), 연결 대기는 하늘색(`#00CFFF`)을 사용합니다. 제목·강조선·확인 버튼에 같은 상태 색을 적용하고 행동 안내 본문은 흰색으로 표시합니다. 웹 미리보기와 펌웨어는 `alerts.json`의 같은 색상표를 사용합니다.

보드의 **안내 확인**을 눌러도 경고는 해제되지 않습니다. 관제에서 해당 상황이 해제되어야 화면이 바뀝니다. 관제 또는 USB 수신이 8초 이상 끊기면 마지막 경고와 연결 끊김 안내를 유지합니다. 보드 전원을 껐다 켜면 RAM의 마지막 경고는 사라지고 연결 대기 화면으로 시작합니다.

## 펌웨어 빌드

대상은 T5AI Board V1.0.2, 35565 LCD, ILI9488, GT1151 터치, LVGL 9입니다. SDK와 플랫폼을 다음 버전으로 고정합니다.

- TuyaOpen: `61e6c645be2cd7cb27d623a7f6a189f5b0f3fca3`
- TuyaOpen T5AI 플랫폼: `e4286054eccbfb136faa0f857861aaa3592fac0e`
- macOS ARM 도구 체인: Arm GNU 13.3.Rel1, SDK가 내려받아 해시 확인

Git, Python, uv가 필요합니다. 첫 빌드는 SDK·플랫폼·도구 체인 다운로드로 시간이 걸립니다.

```sh
sh device/build-firmware.sh
```

검증한 SDK가 이미 있으면 재사용할 수 있습니다.

```sh
TUYA_OPEN_SDK=/tmp/crowdguard-tuyaopen sh device/build-firmware.sh
```

출력은 `device/firmware/dist/firmware_1.0.0/` 아래에 생성됩니다. 새 설치에는 SDK가 생성한 `firmware_QIO_1.0.0.bin`을 사용합니다. OTA 패키지나 코어별 바이너리와 혼동하지 않습니다.

문구의 원본은 [alerts.json](alerts.json)입니다. 한국어 글꼴은 저장소의 Pretendard에서 필요한 글자만 추려 포함했습니다. 문구를 바꾸면 아래 명령으로 헤더와 글꼴을 다시 생성한 뒤 빌드합니다.

```sh
node device/generate-assets.mjs
```

생성된 `cg_font_20.c`, `cg_font_28.c`와 함께 [글꼴 라이선스](../public/fonts/OFL.txt)를 유지합니다.

## 백업과 설치 및 복원

공식 [tyutool CLI](https://docs.tuyaopen.ai/docs/tyutool/cli)의 `read`와 `write`를 사용합니다. T5AI 플래시는 8MiB입니다. 설치 전에는 브리지를 종료하여 직렬 포트를 비웁니다.

```sh
umask 077
mkdir -p device/backups
tyutool_cli read -d t5ai -p /dev/cu.usbmodem5AAE1657771 -s 0x0 -l 0x800000 -f device/backups/original.bin
shasum -a 256 device/backups/original.bin
```

백업에는 기존 설정과 자격 증명이 포함될 수 있어 `device/backups/`는 Git에서 제외합니다. 백업 크기가 8,388,608바이트인지 확인하고 해시를 보관합니다. 2026년 10월 9일 연결된 보드의 원본은 `backups/tclaw-original-20261009.bin`에 보관했으며, 해시는 같은 이름의 `.sha256` 파일에 있습니다.

빌드가 성공한 뒤 실제 출력 파일 경로를 지정합니다.

```sh
tyutool_cli write -d t5ai -p /dev/cu.usbmodem5AAE1657771 -s 0x0 -f device/firmware/dist/firmware_1.0.0/firmware_QIO_1.0.0.bin
```

원본 복원 시에는 아래 명령을 사용합니다. 복원은 현재 알림 펌웨어를 원본으로 교체합니다. 전체 칩을 별도로 지울 필요는 없습니다.

```sh
tyutool_cli write -d t5ai -p /dev/cu.usbmodem5AAE1657771 -s 0x0 -f device/backups/tclaw-original-20261009.bin
```

## 통신과 검증

브라우저 → 로컬 `/api/device/publish` → `/api/device/state` → Python 브리지 → UART CLI → LVGL 순서로 전달합니다. `/api/device/ack`는 보드에서 현재 메시지에 해당하는 응답을 받았을 때만 갱신합니다.

```text
cg_alert 1,<epoch>,<revision>,<kind>,<zone>,<source>,<count>,<fresh>\r
CG_ACK 1,<epoch>,<revision>\r\n
```

`kind`는 alerts.json의 0부터 시작하는 순서, `zone`은 전체/A/B/C의 0/1/2/3, `source`는 시뮬레이션/시험의 0/1입니다. `fresh`는 0 또는 1입니다. 문자열 명령 삽입을 막기 위해 검증된 숫자만 전송하며 보드가 한국어 문구를 선택합니다. 오래된 revision과 같은 revision의 다른 내용은 거부합니다. `cg_status`로 현재 경고 종류와 연결 상태를 확인할 수 있습니다.

```sh
npm test
npm run build
npm run device:test
cc -std=c11 -Wall -Wextra -Werror -fsanitize=address,undefined \
  -I device/firmware/include device/firmware/src/cg_protocol.c \
  device/tests/protocol_test.c -o /tmp/crowdguard-protocol-test
/tmp/crowdguard-protocol-test
```

2026년 10월 9일 연결된 보드에 전용 펌웨어를 설치하고, 화재 시험 경고 수신 시 `CG_STATUS v1 kind=7 stale=0 ...` 응답을 확인했습니다. 전송을 멈춘 뒤에는 같은 경고에서 `stale=1`로 바뀌었으며, 잘못된 패킷은 `CG_ERR invalid`로 거부했습니다. 웹에서 세 출입구 통제 → 경고 수신 응답 → 출입구 복구 → 경고 해제 응답까지 확인했습니다. UART 응답은 펌웨어의 화면 상태 적용을 확인하며, LCD의 실제 가독성과 터치 감도는 실물에서 확인합니다.

## 장착 카메라 활용안

공식 보드 드라이버는 GC2145 DVP 카메라를 지원합니다. [TuyaOpen 보드 설정](https://github.com/tuya/TuyaOpen/blob/61e6c645be2cd7cb27d623a7f6a189f5b0f3fca3/boards/T5AI/TUYA_T5AI_BOARD/Kconfig)의 현재 활성화 옵션은 `CONFIG_TUYA_T5AI_BOARD_CAMERA=y`입니다. 오래된 예제의 `CONFIG_ENABLE_EX_MODULE_CAMERA`와 다르므로 현재 Kconfig를 기준으로 설정해야 합니다.

권장 구성은 **카메라 JPEG → 2.4GHz Wi-Fi → 맥의 영상 분석 → 운영 판단 → 현재 USB 경고 화면**입니다. 보드에서는 촬영·전송·표시를 담당하고, 맥에서는 허용된 YOLO 화재·위험 물체 감지와 MediaPipe 낙상 후보 감지를 수행합니다. OpenAI Decisions API는 후보 사건과 현장 상태를 받아 확인 필요 여부·알림 종류를 선택하도록 연결할 수 있습니다. 사람 이름이나 신원 식별은 필요하지 않습니다.

시작 값으로 320×240 또는 640×480 JPEG를 초당 1~2장 전송하고, 실제 GC2145 드라이버 지원 해상도와 처리 지연을 측정해 조정하는 방안을 제안합니다. 115200 baud UART는 이론상 약 11.5KB/s이므로 영상 전송에 사용하면 경고 응답까지 늦어질 수 있습니다.

카메라와 터치는 I²C 자원을 공유하므로 동시에 동작하는지 확인해야 합니다. 공식 LVGL 카메라 예제는 카메라 미리보기 때 LVGL 갱신을 중단하므로 그대로 적용하면 경고를 가릴 수 있습니다. JPEG 콜백에서 전송 작업을 큐에 넘기고 LCD는 계속 경고에 사용하도록 구성합니다. 연속 관측, 감지 시각, 위치, 운영자 확인을 더한 뒤 실제 감지 입력을 별도로 추가해야 합니다. 현재 펌웨어에서는 카메라 스트리밍을 켜지 않았습니다.
