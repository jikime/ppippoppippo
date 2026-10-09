#!/bin/sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sdk_path=${TUYA_OPEN_SDK:-"$project_root/artifacts/TuyaOpen"}
sdk_commit=61e6c645be2cd7cb27d623a7f6a189f5b0f3fca3

if [ ! -d "$sdk_path/.git" ]; then
  git clone https://github.com/tuya/TuyaOpen.git "$sdk_path"
  git -C "$sdk_path" checkout "$sdk_commit"
fi
if [ "$(git -C "$sdk_path" rev-parse HEAD)" != "$sdk_commit" ]; then
  echo "TuyaOpen 버전이 다릅니다. 검증한 커밋: $sdk_commit" >&2
  echo "TUYA_OPEN_SDK에 해당 커밋의 별도 SDK 경로를 지정해 주세요." >&2
  exit 1
fi
(cd "$sdk_path" && uv sync --frozen)
export OPEN_SDK_ROOT="$sdk_path"
export PATH="$sdk_path/.venv/bin:$PATH"
cd "$project_root/device/firmware"
exec "$sdk_path/.venv/bin/python" "$sdk_path/tos.py" build
