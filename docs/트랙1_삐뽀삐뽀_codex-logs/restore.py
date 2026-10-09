"""같은 폴더의 분할 파일을 검증하고 ZIP으로 복원합니다. Python 3 필요."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
target = root / manifest['public_archive_name']
temporary = root / (target.name + '.restoring')
if target.exists() or temporary.exists():
    raise SystemExit('기존 ZIP/임시 파일이 있어 덮어쓰지 않습니다.')
whole = hashlib.sha256()
total = 0
with temporary.open('xb') as out:
    for part in manifest['parts']:
        name = part['name']
        if Path(name).name != name:
            raise SystemExit('분할 파일 이름 오류')
        single = hashlib.sha256()
        count = 0
        with (root / name).open('rb') as inp:
            while chunk := inp.read(8 * 1024 * 1024):
                single.update(chunk)
                whole.update(chunk)
                count += len(chunk)
                total += len(chunk)
                out.write(chunk)
        if count != part['bytes'] or single.hexdigest() != part['sha256']:
            raise SystemExit('분할 파일 검증 실패: ' + name)
if total != manifest['public_archive_bytes'] or whole.hexdigest() != manifest['public_archive_sha256']:
    raise SystemExit('전체 ZIP 검증 실패')
temporary.rename(target)
print('복원 및 SHA-256 검증 완료: ' + str(target))
