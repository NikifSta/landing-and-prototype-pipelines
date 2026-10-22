#!/usr/bin/env bash
# Нарезка видео на кадры для scrub-анимации по скроллу.
# bash scripts/frames.sh <video.mp4> <outDir> [fps=24] [width=1600]
set -e
in="$1"; out="$2"; fps="${3:-24}"; w="${4:-1600}"
[ -z "$in" ] || [ -z "$out" ] && { echo "usage: frames.sh <video> <outDir> [fps] [width]"; exit 1; }
mkdir -p "$out"
ffmpeg -loglevel error -y -i "$in" -vf "fps=$fps,scale=$w:-2" -q:v 4 "$out/f%04d.jpg"
ffmpeg -loglevel error -y -i "$in" -vf "scale=$w:-2" -frames:v 1 -q:v 3 "$out/poster.jpg"
echo "Кадров: $(ls "$out"/f*.jpg | wc -l) → $out"
