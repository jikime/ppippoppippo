import { mkdirSync,existsSync,renameSync,rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=join(root,'public/media/cctv');
const recordings=[['cam1','KakaoTalk_Video_2026-10-09-13-57-40.mp4'],['cam2','KakaoTalk_Video_2026-10-09-13-57-49.mp4']];
// Preserve the HEVC originals. Only these named venue recordings are exported.
for(const [,name] of recordings)if(!existsSync(join(root,'artifacts/movies',name)))throw new Error(`원본 영상이 없습니다: artifacts/movies/${name}`);
mkdirSync(output,{recursive:true});
function ffmpeg(args){
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin',...args],{stdio:'inherit'});
  if(result.error)throw new Error('영상 준비에는 ffmpeg가 필요합니다.',{cause:result.error});
  if(result.status!==0)throw new Error('CCTV 영상 변환에 실패했습니다.');
}
for(const [id,name] of recordings){
  const input=join(root,'artifacts/movies',name),temp=join(output,`${id}.tmp.mp4`);
  try{
    ffmpeg(['-y','-i',input,'-map','0:v:0','-map','0:a:0?','-vf','scale=1280:-2','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p','-c:a','aac','-b:a','80k','-map_metadata','-1','-movflags','+faststart',temp]);
    renameSync(temp,join(output,`${id}.mp4`));
    ffmpeg(['-y','-ss','1','-i',input,'-frames:v','1','-vf','scale=640:-2','-q:v','4',join(output,`${id}.jpg`)]);
    console.log(`${id}: 720p H.264/AAC + 재생 전 이미지 준비 완료`);
  }finally{rmSync(temp,{force:true});}
}
