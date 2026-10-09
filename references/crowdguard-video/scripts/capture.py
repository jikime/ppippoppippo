#!/usr/bin/env python3
"""CrowdGuard 영상 참조 추출. Python 3, Pillow, ffmpeg, ffprobe가 필요합니다.

python3 scripts/capture.py prepare --source-dir /Users/jikime/Downloads
python3 scripts/capture.py sequence V01 --start 10 --end 14 --fps 8 --name walk
python3 scripts/capture.py sequence V01 --start 10 --end 11 --fps source --name every-frame

프레임 시각은 원본 프레임 번호 / 원본 FPS로 기록합니다.
원본 전체 프레임을 추출하려면 --start 0 --end <영상 길이> --fps source를 사용합니다.
"""

import argparse
import hashlib
import json
import math
import shutil
import subprocess
from fractions import Fraction
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE_NAMES = [
    "KakaoTalk_Video_2026-10-09-09-39-49.mp4",
    "KakaoTalk_Video_2026-10-09-09-40-01.mp4",
    "KakaoTalk_Video_2026-10-09-09-40-11.mp4",
    "KakaoTalk_Video_2026-10-09-09-40-18.mp4",
]


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def rel(path):
    return path.relative_to(ROOT).as_posix()


def stamp(seconds):
    return f"{int(seconds // 60):02d}:{seconds % 60:06.3f}"


def font(size):
    for candidate in ["/System/Library/Fonts/Menlo.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def contact_sheet(frames, output, title, columns=4, width=400):
    row_height = 254
    rows = math.ceil(len(frames) / columns)
    canvas = Image.new("RGB", (columns * width + 32, 74 + rows * row_height), "#101923")
    draw = ImageDraw.Draw(canvas)
    draw.text((18, 19), title, fill="#eaf4f2", font=font(23))
    for i, item in enumerate(frames):
        x = 16 + i % columns * width
        y = 64 + i // columns * row_height
        im = Image.open(ROOT / item["image"])
        thumbnail = ImageOps.contain(im.convert("RGB"), (width - 12, 216))
        canvas.paste(thumbnail, (x + (width - 12 - thumbnail.width) // 2, y))
        draw.text((x + 4, y + 221), f'{stamp(item["time"])} | frame {item["source_frame"]}', fill="#a6cdbf", font=font(14))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, quality=90)


def extract(video, start, end, fps, outdir, png=False):
    source_fps = float(Fraction(video["fps_fraction"]))
    stride = 1 if fps == "source" else max(1, round(source_fps / float(fps)))
    first = max(0, math.ceil(start * source_fps - 1e-6))
    last = min(video["frame_count"] - 1, math.ceil(end * source_fps - 1e-6) - 1)
    if last < first:
        raise ValueError("추출할 프레임이 없는 구간입니다")
    outdir.mkdir(parents=True, exist_ok=True)
    extension = "png" if png else "jpg"
    pattern = outdir / ("frame_%05d." + extension)
    selection = f"select=between(n\\,{first}\\,{last})*not(mod(n-{first}\\,{stride}))"
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(ROOT / video["source"]), "-an", "-vf", selection, "-fps_mode", "vfr"]
    if not png:
        command += ["-q:v", "3"]
    run(command + [str(pattern)])
    frames = []
    for sequence, n in enumerate(range(first, last + 1, stride), 1):
        image_path = outdir / f"frame_{sequence:05d}.{extension}"
        if not image_path.is_file():
            raise RuntimeError(f"프레임 누락: {image_path}")
        frames.append({"time": round(n / source_fps, 6), "source_frame": n, "image": rel(image_path)})
    return frames


def prepare(source_dir):
    videos = []
    for i, name in enumerate(SOURCE_NAMES, 1):
        original = source_dir / name
        target = ROOT / "sources" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, target)
        meta = json.loads(run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(target)]))
        stream = next(s for s in meta["streams"] if s["codec_type"] == "video")
        ident = f"V{i:02d}"
        duration = float(stream["duration"])
        video = {"id": ident, "original_name": name, "original_path": str(original), "source": rel(target), "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "bytes": target.stat().st_size, "duration": duration, "width": stream["width"], "height": stream["height"], "fps_fraction": stream["avg_frame_rate"], "frame_count": int(stream["nb_frames"]), "codec": stream["codec_name"], "has_audio": any(s["codec_type"] == "audio" for s in meta["streams"])}
        write_json(ROOT / "metadata" / f"{ident}.ffprobe.json", meta)
        video["frames"] = extract(video, 0, duration, "1", ROOT / "frames" / ident)
        step = 5 if duration > 60 else 3 if duration > 40 else 2
        overview = video["frames"][::step]
        if overview[-1] != video["frames"][-1]:
            overview.append(video["frames"][-1])
        video["contact_sheets"] = []
        for page, offset in enumerate(range(0, len(overview), 16), 1):
            sheet = ROOT / "contact-sheets" / f"{ident}-{page:02d}.jpg"
            contact_sheet(overview[offset:offset + 16], sheet, f"{ident}  {duration:.2f}s  {stream['width']}x{stream['height']}  /  {page}")
            video["contact_sheets"].append(rel(sheet))
        video["preview"] = video["source"]
        if stream["codec_name"] != "h264":
            preview = ROOT / "previews" / f"{ident}.mp4"
            preview.parent.mkdir(parents=True, exist_ok=True)
            run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(target), "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(preview)])
            video["preview"] = rel(preview)
        videos.append(video)
        print(f"{ident}: {len(video['frames'])} 프레임, {len(video['contact_sheets'])} 콘택트 시트", flush=True)
    write_json(ROOT / "manifest.json", {"version": 1, "purpose": "CrowdGuard 3D 애니메이션과 에셋 구현 참고", "sample_interval_seconds": 1, "timestamp_basis": "원본 CFR 영상의 0부터 시작하는 프레임 번호 / FPS", "videos": videos})


def sequence(args):
    manifest = json.loads((ROOT / "manifest.json").read_text())
    video = next(v for v in manifest["videos"] if v["id"] == args.video)
    frames = extract(video, args.start, args.end, args.fps, ROOT / "sequences" / args.name, args.png)
    out = {"video": args.video, "name": args.name, "start": args.start, "end": args.end, "requested_fps": args.fps, "frames": frames}
    if len(frames) <= 48:
        path = ROOT / "contact-sheets" / (args.name + ".jpg")
        contact_sheet(frames, path, f"{args.video}  {args.name}  {args.start:.2f}-{args.end:.2f}s")
        out["contact_sheet"] = rel(path)
    write_json(ROOT / "sequences" / args.name / "sequence.json", out)
    print(json.dumps({"name": args.name, "frames": len(frames), "path": str(ROOT / "sequences" / args.name)}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--source-dir", type=Path, required=True)
    seq = sub.add_parser("sequence")
    seq.add_argument("video")
    seq.add_argument("--start", type=float, required=True)
    seq.add_argument("--end", type=float, required=True)
    seq.add_argument("--fps", default="8")
    seq.add_argument("--name", required=True)
    seq.add_argument("--png", action="store_true")
    args = parser.parse_args()
    prepare(args.source_dir) if args.command == "prepare" else sequence(args)


if __name__ == "__main__":
    main()
