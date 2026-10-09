"""Reject missing/stale speech assets before building a warning device."""
import hashlib
import json
from pathlib import Path

Import('env')
root = Path(env['PROJECT_DIR'])
try:
    manifest = json.loads((root / 'generated/voice-manifest.json').read_text())
    blob = (root / 'generated/voice.pcm').read_bytes()
    catalog = json.loads((root.parent / 'alerts.json').read_text())
    assert manifest['sampleRate'] == 24000 and len(manifest['clips']) == 18
    offset = 0
    for index, clip in enumerate(manifest['clips']):
        assert clip['offset'] == offset and 0 < clip['bytes'] <= 1440000 and clip['bytes'] % 2 == 0
        data = blob[offset:offset+clip['bytes']]
        assert len(data) == clip['bytes'] and hashlib.sha256(data).hexdigest() == clip['sha256']
        if index < 9:
            kind = catalog['kinds'][index]
            assert clip['id'] == kind['id']
            assert clip['text'] == kind['title'] + '. ' + kind['instruction'].replace('\n',' ')
        offset += clip['bytes']
    assert offset == len(blob) and offset <= 7*1024*1024
except (OSError, ValueError, KeyError, AssertionError) as error:
    raise RuntimeError('음성 자산이 없거나 문구와 맞지 않습니다. 루트에서 npm run device:voices를 실행하세요.') from error
