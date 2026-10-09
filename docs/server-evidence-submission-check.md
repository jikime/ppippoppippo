# 외부 서버 증빙 제출 확인

- 확인일: 2026-10-09 KST
- 확인한 기준: [OpenAI Dev Day Hackathon 외부 서버 증빙 제출 가이드](https://docs.google.com/spreadsheets/d/1eqIC_eVs4lEKYyopykBYg827EttBHDhVQdFTuxTOSKk/edit?gid=192242464#gid=192242464)의 제출 안내·파일 양식·예외와 검토 탭
- 제출 저장소: https://github.com/jikime/ppippoppippo
- 기존 증빙 커밋: `3d6cef8` — Add external server evidence

가이드는 외부 서버 증빙을 ZIP 대신 `server_logs/` 아래의 5개 개별 파일로 커밋하도록 안내합니다. 해당 파일은 이미 저장소에 있으며, 이번 작업에서 파일 존재·CSV 형식·서버/계정/IP 별칭 일치를 대조했습니다. Codex 채팅 로그 ZIP은 이 증빙과 별도 자료입니다.

| 제출 파일 | 현재 내용 |
| --- | --- |
| [01_server_usage.md](../server_logs/01_server_usage.md) | NHN GPU 컨테이너와 개인 Mac mini의 용도·접속·모델·수집 범위·예외 |
| [02_authorized_users.csv](../server_logs/02_authorized_users.csv) | 이번 수집에서 확인한 SSH 계정·접속 방식·역할과 공개키 지문 별칭 |
| [03_remote_access.log](../server_logs/03_remote_access.log) | 실제 성공한 증빙 수집 SSH 세션의 가명처리 스냅샷 및 과거 로그 누락 설명 |
| [04_account_ip_list.csv](../server_logs/04_account_ip_list.csv) | 03에서 확인된 성공 세션의 서버·계정·출발 IP·프로토콜 조합 |
| [05_server_state.txt](../server_logs/05_server_state.txt) | 서버별 수집 시각·OS·프로젝트 범위 상태·모델 해시·확인 한계 |

## 제출 시 함께 설명할 한계

- NHN은 16:09 KST, Mac mini는 16:10 KST의 수집 스냅샷입니다. 행사 전체 또는 17:00 마감 시점까지의 기록을 확보했다는 뜻이 아닙니다.
- 과거 서버 인증 로그는 권한·보존 범위 등의 한계로 확보하지 못했습니다. 성공 인증 원문을 만들어 넣지 않았으며, 과거 접속이 없었다고 주장하지 않습니다. 운영진에 누락 설명과 현재 세션 등 대체 증빙의 인정 여부를 확인해야 합니다.
- 허용 사용자 목록은 확인한 기존 SSH 설정과 관측 계정 범위입니다. 모든 팀원의 허용 계정·공유 키 사용자는 미확인입니다.
- 원격 모델 실행 폴더는 Git 체크아웃으로 확인되지 않았습니다. 기존 `58878e58...`은 증빙 추가 전 로컬 제출 코드 SHA이며 원격 배포 코드 SHA로 주장하지 않습니다.
- 서버별 `fire.pt` 해시가 서로 다르게 기록돼 있습니다. 이 상태 스냅샷으로 두 서버가 같은 화재 모델을 사용했다고 주장하지 않습니다.
- 원본·별칭 대응표는 공개 저장소 밖에 보관한다는 기존 기록을 유지했습니다. 비공개 원본 전달 경로·대상·보관기한 및 보완 마감은 운영진 결정 사항입니다. 이번 확인에서는 원본을 외부로 전송하지 않았습니다.

이 문서는 제출 파일의 형식과 현재 확보 범위를 확인한 기록입니다. 운영진의 최종 접수·심사 통과를 의미하지 않습니다. Google Sheet 원본은 수정하지 않았습니다.
