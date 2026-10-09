#!/usr/bin/env python3
"""ESP32-S3 16MB 백업: 빈 블록도 장치 해시로 확인한 뒤 전체 이미지를 검증합니다.

uv run --with esptool==4.9.0 python device/esp32/backup.py --port PORT --output FILE
읽기 전용이며 eFuse나 플래시를 변경하지 않습니다.
"""
import argparse
import hashlib
import os
from pathlib import Path
from esptool.targets.esp32s3 import ESP32S3ROM


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--expected-mac')
    args=parser.parse_args()
    if args.output.exists():
        parser.error('기존 백업을 덮어쓰지 않습니다. 새 출력 이름을 지정해 주세요.')
    os.umask(0o077)
    size=16*1024*1024; block=64*1024
    empty=b'\xff'*block; empty_md5=hashlib.md5(empty).hexdigest()
    esp=ESP32S3ROM(args.port,115200)
    try:
        esp.connect()
        mac=':'.join(f'{x:02x}' for x in esp.read_mac())
        if args.expected_mac and mac!=args.expected_mac.lower():
            raise RuntimeError('대상 MAC 주소가 다릅니다.')
        esp=esp.run_stub()
        esp.flash_set_parameters(size)
        flash_id=esp.flash_id()
        if flash_id>>16!=0x18:
            raise RuntimeError('16MB Flash 장치가 아닙니다.')
        original=esp.flash_md5sum(0,size)
        image=bytearray()
        for offset in range(0,size,block):
            digest=esp.flash_md5sum(offset,block)
            if digest==empty_md5:
                data=empty
            else:
                data=esp.read_flash(offset,block)
                if len(data)!=block or hashlib.md5(data).hexdigest()!=digest:
                    raise RuntimeError(f'블록 검증 실패: {offset:#x}')
            image.extend(data)
            if offset%(1024*1024)==0:print(f'{offset//1024//1024+1}/16 MiB 검증 중',flush=True)
        if hashlib.md5(image).hexdigest()!=original or esp.flash_md5sum(0,size)!=original:
            raise RuntimeError('전체 Flash 해시가 일치하지 않습니다.')
        args.output.parent.mkdir(parents=True,exist_ok=True)
        with args.output.open('xb') as file:file.write(image)
        sha=hashlib.sha256(image).hexdigest()
        args.output.with_suffix(args.output.suffix+'.sha256').write_text(f'{sha}  {args.output.name}\n')
        print(f'16,777,216바이트 백업·전체 장치 해시 검증 완료: {args.output.name}',flush=True)
        print(f'SHA256 {sha}',flush=True)
        # Leave the stub running for the immediately following firmware installation.
    finally:
        esp._port.close()


if __name__=='__main__':main()
