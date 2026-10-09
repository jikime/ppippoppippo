import {writeFileSync} from 'node:fs';
import {generateCharacters,PRESETS} from '../lib/character-specs.mjs';
import {zipSync,strToU8} from 'fflate';
const files={};
for(const preset of PRESETS){const chars=generateCharacters({preset:preset.id,seed:'AWS-HACKATHON-2026',count:1000,variation:90});files[preset.id+'-1000.json']=strToU8(JSON.stringify({schema:'crowd-studio/1.1',preset:preset.name,count:chars.length,seed:'AWS-HACKATHON-2026',modelFilesGenerated:0,characters:chars},null,2));}
files['README.txt']=strToU8('11개 장소 × 1,000명 = 11,000명 캐릭터 명세. 실제 3D 모델은 아직 생성되지 않았습니다. 각 prompt를 생성 API에 보내면 됩니다. 같은 seed는 명세만 재현합니다. 소품과 예상 동작은 계획 메타데이터입니다.\n11 venue presets × 1,000 character briefs. No model files generated.');
const target=process.argv[2]||'../crowd-character-briefs-11000.zip';const zip=zipSync(files,{level:6});writeFileSync(target,zip);console.log(JSON.stringify({path:target,characters:11000,bytes:zip.byteLength}));
