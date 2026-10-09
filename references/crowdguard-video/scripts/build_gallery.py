#!/usr/bin/env python3
"""선별 PNG와 오프라인 갤러리 데이터를 생성합니다. capture.py prepare 이후 실행."""
import json
from fractions import Fraction
from pathlib import Path

from capture import ROOT, run, write_json


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    catalog = json.loads((ROOT / "reference-catalog.json").read_text())
    by_id = {v["id"]: v for v in manifest["videos"]}
    data = dict(catalog)
    data["videos"] = [dict(by_id[v["id"]], **v) for v in catalog["videos"]]
    data["shots"] = []
    (ROOT / "keyframes").mkdir(exist_ok=True)
    for shot in catalog["shots"]:
        video = by_id[shot["video"]]
        fps = float(Fraction(video["fps_fraction"]))
        frame = round(shot["time"] * fps)
        path = ROOT / "keyframes" / (shot["id"] + ".png")
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(ROOT / video["source"]), "-an", "-vf", f"select=eq(n\\,{frame})", "-frames:v", "1", "-fps_mode", "vfr", str(path)])
        data["shots"].append(dict(shot, time=frame / fps, source_frame=frame, image=path.relative_to(ROOT).as_posix()))
    data["sequences"] = []
    for spec in catalog["sequences"]:
        sequence = json.loads((ROOT / "sequences" / spec["name"] / "sequence.json").read_text())
        frames = sequence["frames"]
        sequence["actual_fps"] = round(1 / (frames[1]["time"] - frames[0]["time"]), 3) if len(frames) > 1 else 0
        data["sequences"].append(dict(sequence, **spec))
    data["stats"] = {
        "videos": len(data["videos"]),
        "duration": round(sum(v["duration"] for v in data["videos"]), 3),
        "source_frames": sum(v["frame_count"] for v in data["videos"]),
        "overview_frames": sum(len(v["frames"]) for v in data["videos"]),
        "sequence_frames": sum(len(s["frames"]) for s in data["sequences"]),
        "keyframes": len(data["shots"]),
        "sequences": len(data["sequences"]),
        "assets": len(data["assets"]),
        "animations": len(data["animation_requirements"]),
    }
    data["stats"]["saved_frames"] = sum(data["stats"][k] for k in ("overview_frames", "sequence_frames", "keyframes"))
    write_json(ROOT / "reference-data.json", data)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    (ROOT / "reference-data.js").write_text("window.CROWDGUARD_REFERENCE = " + payload + ";\n")
    print(json.dumps(data["stats"], ensure_ascii=False))


if __name__ == "__main__":
    main()
