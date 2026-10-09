#!/usr/bin/env python3
"""검증된 경고를 Tuya 화면 또는 ESP32 LED·음성 보드로 전달합니다."""
import argparse
import json
import re
import sys
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen

KINDS = ('clear', 'exit_closed', 'congestion', 'route_blocked', 'all_exits_closed', 'fall', 'medical', 'fire', 'weapon')
SOURCES = ('simulation', 'test')


def number(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError('허용 범위를 벗어난 디바이스 메시지입니다.')
    return value


def encode_command(state):
    """서버의 임의 문자열을 CLI로 전달하지 않고 숫자로만 구성합니다."""
    if type(state) is not dict or type(state.get('display')) is not dict:
        raise ValueError('관제 응답 형식이 올바르지 않습니다.')
    display = state['display']
    if type(display.get('fresh')) is not bool:
        raise ValueError('관제 연결 상태가 올바르지 않습니다.')
    kind = KINDS.index(display.get('kind'))
    count = number(display.get('count'), 0, 32)
    if (kind == 0) != (count == 0):
        raise ValueError('경고 종류와 개수가 일치하지 않습니다.')
    values = (1, number(state.get('epoch'), 1, 0x7fffffff), number(state.get('revision'), 0, 0x7fffffff),
              kind, number(display.get('zone'), 0, 3), SOURCES.index(display.get('source')), count, int(display['fresh']))
    return ('cg_alert ' + ','.join(map(str, values)) + '\r').encode('ascii')


def matches_ack(data, epoch, revision):
    # Do not confuse the CLI echo, an old acknowledgement or ordinary debug logs with an ACK.
    return re.search(rb'(?:^|[\r\n])CG_ACK 1,' + str(epoch).encode() + rb',' + str(revision).encode() + rb'(?=[\r\n])', data) is not None


def request(base, path, data=None):
    body = None if data is None else json.dumps(data).encode()
    req = Request(base + path, data=body, headers={'Content-Type': 'application/json'})
    with urlopen(req, timeout=2) as response:
        raw = response.read(32769)
        if len(raw) > 32768:
            raise ValueError('관제 응답이 너무 큽니다.')
        return json.loads(raw)


def find_port(device='display'):
    from serial.tools import list_ports
    ports = [p.device for p in list_ports.comports() if
             (device == 'display' and p.vid == 0x1a86 and p.pid == 0x55d2 and p.device.endswith('1')) or
             (device == 'beacon' and p.vid == 0x303a and p.pid == 0x1001)]
    if len(ports) != 1:
        raise RuntimeError('대상 USB 포트를 하나로 특정하지 못했습니다. --port 옵션으로 지정해 주세요.')
    return ports[0]


def open_port(path):
    import serial
    port = serial.Serial(None, 115200, timeout=0.1, write_timeout=1, exclusive=True)
    port.dtr = False
    port.rts = False
    port.port = path
    port.open()
    return port


def beacon_status(data, state):
    for line in data.splitlines():
        if not re.fullmatch(rb'JG_STATUS -?[0-9]{1,10}(?:,-?[0-9]{1,10}){12}', line):
            continue
        values = [int(v) for v in line[10:].split(b',')]
        version, epoch, revision, kind, fresh, muted, volume, ready, playing, completed, clip, leds, psram = values
        if (version, epoch, revision, kind) != (1,state['epoch'],state['revision'],KINDS.index(state['display']['kind'])):
            continue
        if any(v not in (0,1) for v in (fresh,muted,ready,playing)) or not 10<=volume<=75 or not 0<=completed<=0xffffffff or not -1<=clip<=17 or leds!=7 or not 0<=psram<=8*1024*1024:
            continue
        return {'audioReady':bool(ready),'muted':bool(muted),'playing':bool(playing),'volume':volume,'completed':completed}
    return None


def exchange(port, state, timeout=1.5, telemetry=None):
    command = encode_command(state)
    port.reset_input_buffer()
    port.write(command)
    port.flush()
    deadline = time.monotonic() + timeout
    received = bytearray()
    while time.monotonic() < deadline:
        received.extend(port.read(min(max(port.in_waiting, 1), 2048)))
        if matches_ack(received, state['epoch'], state['revision']):
            if telemetry is None:
                return True
            status = beacon_status(received, state)
            if status is not None:
                telemetry.update(status)
                return True
        if len(received) > 8192:
            del received[:-4096]
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:5173')
    parser.add_argument('--device', choices=['display','beacon'], default='display', help='display: Tuya 화면, beacon: ESP32 LED·스피커')
    parser.add_argument('--port', help='대상 USB 포트. 생략하면 장치 종류별로 자동 탐색')
    parser.add_argument('--once', action='store_true', help='한 번 전송 후 종료')
    parser.add_argument('--dry-run', action='store_true', help='직렬 포트를 열지 않고 전송 내용을 출력')
    args = parser.parse_args()
    url = urlparse(args.url)
    if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost', '::1') or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment:
        parser.error('--url에는 로컬 관제 서버 주소를 지정해 주세요.')
    base = args.url.rstrip('/')
    port = None
    last_status = None
    try:
        while True:
            ok = False
            try:
                state = request(base, '/api/device/state')
                command = encode_command(state)
                if args.dry_run:
                    print(command.decode().strip())
                    return 0
                telemetry = {} if args.device=='beacon' else None
                try:
                    if port is None:
                        port = open_port(args.port or find_port(args.device))
                        if args.device == 'beacon':
                            # Native USB can reset the ESP32 when opening. Wait only once per connection.
                            time.sleep(2)
                    ok = exchange(port, state, telemetry=telemetry)
                except Exception:
                    if port is not None:
                        port.close()
                        port = None
                    raise
                ack = {'device':args.device, 'epoch': state['epoch'], 'revision': state['revision'], 'port': port.port, 'ok': ok}
                if telemetry:
                    ack['telemetry'] = telemetry
                request(base, '/api/device/ack', ack)
                label = '화면' if args.device == 'display' else 'LED·음성'
                status = f'{label} 보드의 경고 적용 응답을 받았습니다.' if ok else '보드 응답 대기: JEONJO 알림 펌웨어가 설치되어 있는지 확인해 주세요.'
            except Exception as exc:
                # Log status only, never raw device logs or credentials.
                status = f'연결 확인 필요 ({type(exc).__name__}). 관제 서버와 USB 연결을 확인해 주세요.'
                # A changing server revision / HTTP outage must not reboot a speaking ESP32.
                # Only a serial transport failure above closes the native USB handle.
            if status != last_status:
                print(status, flush=True)
                last_status = status
            if args.once:
                return 0 if ok else 2
            time.sleep(0.5)
    except KeyboardInterrupt:
        return 0
    finally:
        if port is not None:
            port.close()


if __name__ == '__main__':
    sys.exit(main())
