#!/usr/bin/env python3
"""Fit keyframes to the video model's own frame before they are sent as references.

Both Seedance routes (the fal endpoint and the Dreamina web interface) re-crop a reference whose
shape differs from the target frame, and their crop is arbitrary — a head can lose its top. Fitting
locally keeps that decision here: scale by width, then centre-crop the vertical overflow.

Landing copy: scales to COVER the frame, so a 2:3 frame fitted to 9:16 gets no black bars.
"""

from __future__ import annotations

from pathlib import Path

FITTED_KEYFRAME_FILENAME_TEMPLATE = "image-{tag_number:02d}-{source_stem}.png"


def fit_keyframes_to_model_frame(
    keyframe_paths: list[Path], prepared_dir: Path, frame_width_px: int, frame_height_px: int
) -> list[Path]:
    """Fit every keyframe to the model frame and return the prepared files in the same order."""
    prepared_dir.mkdir(parents=True, exist_ok=True)
    fitted_paths = []
    for tag_number, keyframe_path in enumerate(keyframe_paths, start=1):
        fitted_path = prepared_dir / FITTED_KEYFRAME_FILENAME_TEMPLATE.format(
            tag_number=tag_number, source_stem=keyframe_path.stem
        )
        fitted_paths.append(
            _fit_one_keyframe(keyframe_path, fitted_path, frame_width_px, frame_height_px)
        )
    return fitted_paths


def _fit_one_keyframe(
    source_path: Path, target_path: Path, frame_width_px: int, frame_height_px: int
) -> Path:
    """Scale one keyframe to cover the frame, then centre-crop whatever hangs outside it."""
    from PIL import Image

    with Image.open(source_path) as source_image:
        cover_scale = max(frame_width_px / source_image.width, frame_height_px / source_image.height)
        scaled_width = round(source_image.width * cover_scale)
        scaled_height = round(source_image.height * cover_scale)
        scaled_image = source_image.convert("RGB").resize((scaled_width, scaled_height), Image.LANCZOS)
    crop_left = (scaled_width - frame_width_px) // 2
    crop_top = (scaled_height - frame_height_px) // 2
    scaled_image.crop(
        (crop_left, crop_top, crop_left + frame_width_px, crop_top + frame_height_px)
    ).save(target_path, format="PNG")
    return target_path
