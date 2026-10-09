# JEONJO LED·음성 경고 보드

Tuya 화면과 같은 경고를 **Waveshare ESP32-S3-AUDIO-Board**의 7개 LED와 한국어 음성으로 전달합니다. LED 갱신과 스피커 재생은 서로 다른 작업으로 실행합니다. USB로 새로운 상황이 들어오면 재생 중에도 경고가 바뀝니다.

현재 입력은 관제 시뮬레이션과 시험 경고입니다. 음성에서도 출처와 AI 합성 음성임을 알립니다. 보드가 자체적으로 화재·낙상·총기를 감지하는 구성은 아닙니다.

## 확인한 하드웨어

연결된 장치에서 읽은 정보는 ESP32-S3 rev 0.2, 240MHz, 16MB Flash, 8MB PSRAM, USB VID/PID `303a:1001`입니다. 기존 프로그램명은 `waveshare_usb_tts`, 부팅 메시지는 `WAVESHARE_VOICE_READY v3`이며 ES8311·ES7210을 초기화합니다. 이 구성은 [Waveshare 공식 보드 문서](https://docs.waveshare.com/ESP32-S3-AUDIO-Board)와 일치합니다.

| 자원 | 용도 |
| --- | --- |
| Xtensa LX7 듀얼 코어, 최대 240MHz | LED·버튼과 음성 재생을 분리 |
| Flash 16MB | 펌웨어와 한국어 안내 18개 저장, 실행 중 API 호출 불필요 |
| PSRAM 8MB | 오디오 작업 버퍼 |
| RGB LED 7개, GPIO38 | 위험별 색·점멸·회전 패턴 |
| ES8311 + 앰프 + 스피커 | 24kHz/16bit 한국어 음성 |
| 사용자 버튼 3개 | 음량 증가·음소거/다시 듣기·음량 감소 |
| ES7210 + 마이크 2개 | 후속 확장: 누르고 말하는 도움 요청, 소음 수준 측정 |
| PCF85063 RTC | 후속 확장: 전원 복구 후 경고 시각 유지 |
| TF 슬롯 | 후속 확장: 다국어 안내·긴 음원 저장 |
| 2.4GHz Wi-Fi, BLE 5 LE | 후속 확장: USB 대신 무선 관제·초기 설정 |
| DVP 카메라·LCD 인터페이스 | 추가 모듈 확장. 현재 경고 장치는 Tuya LCD와 역할을 나눔 |
| 3.7V 배터리 충전 회로 | 배터리가 있을 때 이동형 알림 장치로 확장 가능 |

마이크·RTC·TF·무선·카메라 기능은 이번 펌웨어에서 활성화하지 않았습니다. 현재 음성 경고는 보드 플래시에 저장하므로 TF 카드가 없어도 재생됩니다. 새 경고 수신에는 관제 서버와 USB 브리지가 필요합니다.

핀은 [공식 회로도](https://files.waveshare.com/wiki/ESP32-S3-AUDIO-Board/ESP32-S3-AUDIO-Board_1.1.pdf)와 [공식 예제](https://docs.waveshare.com/ESP32-S3-AUDIO-Board/Resources-And-Documents)를 기준으로 지정했습니다. 다른 ESP32-S3 제품에 그대로 업로드하지 않습니다.

| 신호 | 핀 |
| --- | --- |
| RGB LED | GPIO38, RGB 순서 |
| I²C | SDA11, SCL10 |
| I²S 스피커 | MCLK12, BCLK13, LRCK14, DOUT16 |
| TCA9555 주소 | 0x20 |
| 앰프 활성화 | EXIO8 |
| 버튼 KEY1/2/3 | EXIO9/10/11, 눌렀을 때 LOW |

## 상황별 동작

색상은 Tuya 화면과 같은 원색 계열입니다. LED의 밝기는 전류·눈부심을 줄이도록 별도로 제한하며, 색의 채도는 유지합니다.

| 상황 | LED | 음성 반복 |
| --- | --- | --- |
| 경고 없음, 관제 연결됨 | 초록 숨쉬기 | 변경 시 한 번 |
| 출입구 통제 | 노랑 점멸 | 60초 |
| 이동 정체 | 노랑 숨쉬기 | 60초 |
| 경로 막힘 | 노랑 회전 | 60초 |
| 모든 출입구 통제 | 빨강 전체 점멸 | 30초 |
| 낙상 의심 | 빨강 두 번 점멸 | 30초 |
| 응급 도움 요청 | 빨강 맥박 모양 점멸 | 30초 |
| 화재 의심 | 빨강 1초 주기 점멸 | 30초 |
| 위험 물체 의심 | 빨강 좌우 교차 | 30초 |
| 연결 대기 | 하늘색 회전 | 시작 안내 한 번 |
| 연결 끊김 | 마지막 경고 유지 + 하늘색 표시 | 연결 끊김 안내 한 번 |

경고가 여러 개면 화면과 동일한 우선순위로 하나를 안내하고, 다른 경고가 있음을 덧붙입니다. A/B/C 구역은 LED 두 개씩 약하게 유지하여 구분하며, 음성으로도 위치를 읽습니다. 링 방향을 실제 출입구 방향으로 단정하지 않습니다.

동일 경고의 USB heartbeat는 음성을 재시작하지 않습니다. 경고 종류·위치·출처가 바뀌면 이전 음성을 중단하고 새 안내를 시작합니다. 음소거는 현재 안내에만 적용하므로 새로운 경고는 다시 들립니다. 관제 수신이 8초 끊기면 경고 색을 유지하고 음성 반복을 멈춥니다. 재연결 전의 `경고 없음` 메시지로 활성 경고를 지우지 않습니다. 전원이 끊기면 마지막 경고는 보존되지 않으며 다음 부팅은 연결 대기 상태입니다.

버튼은 KEY1=음량 +5, KEY3=음량 -5, KEY2 짧게=현재 안내 음소거/해제, KEY2 1초=다시 듣기입니다. 음량 범위는 10~75, 기본 65입니다. 이는 코덱 설정값이며 음압 측정값이 아닙니다. LED는 음소거 중에도 계속 동작합니다. 코덱의 디지털 이득은 최대 0dB로 제한하고, 음원 피크도 80% 이하로 유지합니다.

## 실행과 관제 확인

프로젝트 루트의 별도 터미널에서 실행합니다.

```sh
npm run dev
npm run device:bridge   # Tuya 화면 (별도 터미널)
npm run device:beacon   # ESP32 LED·스피커 (별도 터미널)
```

`device/requirements.txt`의 pyserial이 필요합니다. ESP32 포트 자동 탐색이 어려우면 `npm run device:beacon -- --port /dev/cu.usbmodem1101`처럼 지정합니다. 포트 번호는 재연결 시 바뀔 수 있습니다.

웹의 **디바이스 알림**에는 두 장치의 응답이 따로 표시됩니다. ESP32는 LED 적용 응답과 스피커 초기화·음소거·재생 상태를 함께 보고합니다. 재생 완료 횟수는 I²S 전송 완료 수이며 사람이 실제 소리를 들었음을 뜻하지 않습니다.

## 음성 생성과 빌드

PlatformIO와 Node.js가 필요합니다. 음성을 처음 생성할 때만 `.env.local`의 `OPENAI_API_KEY`를 읽습니다. [OpenAI Speech API](https://developers.openai.com/api/docs/guides/text-to-speech)의 `gpt-4o-mini-tts-2025-12-15`, `marin` 음성을 사용합니다. 행사 운영 판단은 기존 OpenAI Decisions API를 그대로 사용합니다.

```sh
npm run device:voices
npm run device:esp32:build
```

음성은 24kHz, 16bit little-endian PCM입니다. 생성 캐시는 `device/voice-cache/`, 펌웨어에 넣는 결합 음원과 색인은 `generated/`에 저장하며 Git에서 제외합니다. 같은 문구·모델·목소리로 다시 실행하면 캐시를 사용합니다. 문구를 바꾼 뒤 음성을 다시 생성하지 않으면 빌드를 거부합니다. 생성 당시 18개 음원은 약 4.05MiB, 전체 펌웨어는 약 4.4MiB입니다.

PlatformIO `espressif32@6.9.0` / Arduino ESP32 2.0.17 / Adafruit NeoPixel 1.12.3을 사용합니다. ES8311 드라이버는 공식 Waveshare 예제의 Apache-2.0 소스와 라이선스를 보존했습니다. 보드가 실제 16MB/8MB 모델인지 확인한 뒤 사용합니다.

## 백업·설치·복원

설치 전에 ESP32 브리지를 종료합니다. Tuya 브리지는 그대로 실행해도 됩니다. 기존 `waveshare_usb_tts` 프로그램은 JEONJO 펌웨어로 교체됩니다.

```sh
umask 077
mkdir -p device/backups
uv tool run --from esptool==5.1.0 esptool --chip esp32s3 --port /dev/cu.usbmodem1101 read-flash 0 ALL device/backups/waveshare-original.bin
shasum -a 256 device/backups/waveshare-original.bin
```

백업 크기가 16,777,216바이트인지 확인하고 해시와 함께 보관합니다. 백업은 원래 설정을 포함할 수 있어 Git에서 제외합니다. 원본이 확보된 뒤 업로드합니다.

2026년 10월 9일 연결된 보드의 원본은 `device/backups/waveshare-original-20261009.bin`에 보관했습니다. 전체 장치 해시와 일치함을 확인했으며 SHA256은 같은 이름의 `.sha256` 파일에 있습니다.

전체 읽기가 오래 걸리는 경우 `uv run --with esptool==4.9.0 python device/esp32/backup.py --port /dev/cu.usbmodem1101 --output device/backups/waveshare-original.bin`을 사용할 수 있습니다. 빈 블록은 장치가 계산한 MD5로 확인한 뒤 채우고, 데이터가 있는 블록은 실제로 읽습니다. 완성 이미지 전체를 읽기 전·후 장치 해시와 대조하고 SHA256도 보관합니다. 기존 파일은 덮어쓰지 않습니다.

```sh
pio run -d device/esp32 -t upload --upload-port /dev/cu.usbmodem1101
npm run device:beacon
```

기존 프로그램 복원은 해당 보드의 전체 백업을 0번지에 기록합니다.

```sh
uv tool run --from esptool==5.1.0 esptool --chip esp32s3 --port /dev/cu.usbmodem1101 write-flash 0 device/backups/waveshare-original.bin
```

이 보드의 native USB는 포트를 열 때 재부팅될 수 있습니다. 응답이 멈추면 ESP32의 USB만 다시 연결하거나 BOOT를 누른 채 RESET을 눌러 다운로드 모드로 진입합니다. 고속 전송이 불안정하면 115200으로 낮춥니다.

## 검증

2026년 10월 9일 실제 보드에 설치한 뒤 9개 상태의 적용 ACK, 스피커 초기화, 화재 안내 전체 재생 완료 응답, heartbeat 후 음소거 유지, 새 경고에서 음소거 해제, 연결되지 않은 새 서버의 경고 해제 거부를 확인했습니다. 웹에서 보낸 B 구역 화재 시험은 Tuya와 ESP32가 동일한 상태 번호로 수신했습니다. 시험은 해제했으며 두 USB 브리지를 실행해 둔 상태입니다. 물리 버튼 조작과 현장에서 들리는 음량은 별도 확인이 필요합니다.

```sh
npm test
npm run device:test
clang -std=c11 -Wall -Wextra -Werror -fsanitize=address,undefined -I device/firmware/include -I device/esp32/include device/tests/beacon_test.c device/firmware/src/cg_protocol.c -o /tmp/jeonjo-beacon-test
/tmp/jeonjo-beacon-test
npm run device:esp32:build
```

USB 명령은 Tuya와 같은 `cg_alert 1,epoch,revision,kind,zone,source,count,fresh`이며 적용 후 `CG_ACK`를 반환합니다. `jg_status`는 음성 상태, `jg_mute`는 현재 안내 음소거, `jg_replay`는 다시 듣기, `jg_volume 10`~`jg_volume 75`는 음량 설정입니다. 브리지가 사용하는 포트를 동시에 열지 않습니다.
