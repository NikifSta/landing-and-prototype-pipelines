#!/usr/bin/env python3
"""Render one landing scroll clip with Seedance 2.5 in the Dreamina web interface.

The clip starts on the given frame (Dreamina's First and last frames mode) in the given frame shape,
at the highest resolution tier unless another is asked for. Ported from video-generation's Dreamina
route without Telegram delivery, owner-photo refusal and motion reference video. The soundtrack stays
in the raw clip; encode.sh of scroll-craft strips it.

    .venv/bin/python dev/pipelines/landing-video-generator/tools/landing_scroll_clip_dreamina_renderer.py \
      --start-frame <frame.png> --prompt-file <camera-move-en.txt> --aspect-ratio 16:9 \
      --duration-seconds 5 --output-clip <zone-folder>/<zone>-16x9-raw.mp4 [--resolution 720P]

Needs a live navigator Chrome signed in to Dreamina (real-chrome-web-navigator skill). Renders go one at a
time: every render drives the same Chrome tab, so a second run waits on a file lock until the first ends.

A failure that is not a business stop goes to an LLM repair agent (landing_video_renderer_llm_repair_loop);
the renderer reruns itself after a fix only when the failed run never reached the submit.
--stop-before-submit makes a free check run: everything up to the submit, nothing pressed or charged.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import subprocess
import sys
import traceback
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import TextIO

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import dreamina_render_settings as settings  # noqa: E402
import landing_video_renderer_llm_repair_loop as repair_loop  # noqa: E402

STATUS_FILENAME_SUFFIX = "-dreamina-status.json"
FITTED_START_FRAME_SUBDIR_NAME = "dreamina-fitted-start-frame"
# Short side of the fitted start frame; Dreamina scales it to the chosen tier itself.
FITTED_FRAME_SHORT_SIDE_PX = 1080
LONG_TO_SHORT_SIDE_RATIO = 16 / 9
FFPROBE_ERROR_TAIL_CHARACTERS = 200
# tools -> landing-video-generator -> pipelines -> dev -> repository root.
REPOSITORY_ROOT = TOOLS_DIR.parents[3]
# Every render drives the one navigator Chrome tab, and the finished-clip watcher tells "its" clip only by
# newness, frame shape and length, so two renders at once clobber each other. The lock lives in the
# git-ignored dev/temp/; the kernel drops it when the holding process ends, so a crash leaves no stale lock.
DREAMINA_RENDER_ONE_AT_A_TIME_LOCK_PATH = (
    REPOSITORY_ROOT / "dev" / "temp" / "landing-video-generator" / "dreamina-render-one-at-a-time.lock")
ANOTHER_RENDER_RUNNING_WAIT_MESSAGE_START = "Another Dreamina render is running"
# Repairs run one at a time: two renders failing together would otherwise send two agents to edit the same files.
DREAMINA_RENDERER_REPAIR_ONE_AT_A_TIME_LOCK_PATH = DREAMINA_RENDER_ONE_AT_A_TIME_LOCK_PATH.with_name(
    "dreamina-renderer-repair-one-at-a-time.lock")
# The last line of a free check run (--stop-before-submit); the repair agent looks for it.
STOPPED_BEFORE_SUBMIT_MESSAGE = "stopped before submit — nothing was charged"
# Status states: before the submit, and from the submit on, when the credits may already be spent.
RENDERING_STATE = "rendering"
SUBMITTED_STATE = "submitted"


class StoppedBeforeSubmit(Exception):
    """Raised at the submit of a free check run: everything before it ran, nothing was pressed or charged."""


def parse_command_line_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    """Read the start frame, prompt file, frame shape, resolution tier, duration and output clip path."""
    parser = argparse.ArgumentParser(description="Render one landing scroll clip in Dreamina.")
    parser.add_argument("--start-frame", required=True, type=Path, help="the frame the clip starts on")
    parser.add_argument("--prompt-file", required=True, type=Path, help="UTF-8 English camera-move prompt")
    parser.add_argument("--aspect-ratio", required=True, choices=settings.SUPPORTED_ASPECT_RATIO_LABELS)
    parser.add_argument("--resolution", default=settings.HIGHEST_OFFERED_RESOLUTION,
                        help="tier label such as 720P; by default the highest tier the page offers")
    parser.add_argument("--duration-seconds", required=True, type=validate_duration_within_model_bounds)
    parser.add_argument("--output-clip", required=True, type=Path, help="where the downloaded mp4 goes")
    parser.add_argument(repair_loop.STOP_BEFORE_SUBMIT_OPTION, action="store_true",
                        help="free check: do everything up to the submit, press nothing, charge nothing")
    # Set by the renderer itself when it reruns after a repair; callers leave it alone.
    parser.add_argument(repair_loop.REPAIR_ATTEMPTS_LEFT_OPTION, type=int,
                        default=repair_loop.DEFAULT_REPAIR_ATTEMPTS_PER_RUN, help=argparse.SUPPRESS)
    return parser.parse_args(argv)


def validate_duration_within_model_bounds(raw_value: str) -> int:
    """Accept a whole number of seconds inside the model bounds; return it as int."""
    minimum = settings.SEEDANCE_2_5_DURATION_MIN_SECONDS
    maximum = settings.SEEDANCE_2_5_DURATION_MAX_SECONDS
    if not raw_value.isdigit() or not minimum <= int(raw_value) <= maximum:
        raise argparse.ArgumentTypeError(
            f"duration must be a whole number of seconds from {minimum} to {maximum}, got '{raw_value}'")
    return int(raw_value)


def fitted_frame_size_px(aspect_ratio_label: str) -> tuple[int, int]:
    """Width and height of the fitted start frame for a supported frame shape."""
    long_side_px = round(FITTED_FRAME_SHORT_SIDE_PX * LONG_TO_SHORT_SIDE_RATIO)
    if aspect_ratio_label == settings.WIDE_ASPECT_RATIO_LABEL:
        return long_side_px, FITTED_FRAME_SHORT_SIDE_PX
    return FITTED_FRAME_SHORT_SIDE_PX, long_side_px


def status_path_for(output_clip: Path) -> Path:
    """The status JSON lives next to the clip and shares its name."""
    return output_clip.with_name(output_clip.stem + STATUS_FILENAME_SUFFIX)


def preflight_imports() -> dict:
    """Import the browser driver and the frame fitter, printing the environment when one is missing."""
    try:
        from PIL import Image  # noqa: F401 — the fitter needs Pillow

        import dreamina_web_ui_video_generation_driver as dreamina_driver
        from keyframe_to_model_frame_fitter import fit_keyframes_to_model_frame
    except ImportError as error:
        print(f"preflight import failed: {error}", file=sys.stderr, flush=True)
        print(f"python executable: {sys.executable}", file=sys.stderr, flush=True)
        print(f"PATH: {os.environ.get('PATH', '')}", file=sys.stderr, flush=True)
        sys.exit("install the missing package into .venv (playwright, Pillow) and retry")
    return {"dreamina_driver": dreamina_driver, "fit_keyframes_to_model_frame": fit_keyframes_to_model_frame}


def read_prompt_after_checking_inputs(start_frame: Path, prompt_file: Path) -> str:
    """Stop before the browser is touched when the frame or the prompt is missing or empty."""
    if not start_frame.is_file():
        sys.exit(f"start frame not found: {start_frame}")
    if not prompt_file.is_file():
        sys.exit(f"prompt file not found: {prompt_file}")
    prompt_text = prompt_file.read_text(encoding="utf-8").strip()
    if not prompt_text:
        sys.exit(f"prompt file is empty: {prompt_file}")
    return prompt_text


def build_render_request(driver_module, args: argparse.Namespace, prompt_text: str, fitted_start_frame: Path):
    """Assemble the driver's request: one start frame, no video input, the chosen shape and tier."""
    return driver_module.DreaminaRenderRequest(
        reference_image_paths=[fitted_start_frame],
        prompt_text=prompt_text,
        duration_seconds=args.duration_seconds,
        aspect_ratio_label=args.aspect_ratio,
        resolution_label=args.resolution,
        model_label=settings.DREAMINA_SEEDANCE_2_5_MODEL_LABEL,
        generation_mode_label=settings.DREAMINA_START_FRAME_MODE_LABEL,
        output_clip_path=args.output_clip,
        poll_interval_seconds=settings.DREAMINA_RENDER_POLL_INTERVAL_SECONDS,
        render_timeout_seconds=settings.DREAMINA_RENDER_TIMEOUT_SECONDS,
        render_consumes_video_input=False,
    )


def read_clip_frame_size(clip_path: Path) -> str:
    """Ask ffprobe for the clip's picture size such as '1280x720'; the tier label can differ from it."""
    completed = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
         "-of", "csv=s=x:p=0", str(clip_path)], capture_output=True, text=True)
    if completed.returncode != 0:
        return f"unknown: {completed.stderr.strip()[-FFPROBE_ERROR_TAIL_CHARACTERS:]}"
    return completed.stdout.strip()


def write_status(status_path: Path, status: dict) -> None:
    """Persist the render status JSON next to the clip."""
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")


def take_lock_or_wait_for_running_render(lock_file: TextIO, lock_path: Path) -> None:
    """Take the exclusive lock at once, or say once that another render runs and block until it frees."""
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print(f"{ANOTHER_RENDER_RUNNING_WAIT_MESSAGE_START} (all renders share one Chrome tab); "
              f"this run waits for it to finish. Lock: {lock_path}", flush=True)
        fcntl.flock(lock_file, fcntl.LOCK_EX)


@contextmanager
def exclusive_dreamina_render_lock(lock_path: Path) -> Iterator[None]:
    """Hold the one-render-at-a-time lock for the whole block; closing the file releases it."""
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "a", encoding="utf-8") as lock_file:
        take_lock_or_wait_for_running_render(lock_file, lock_path)
        yield


def render_clip(helpers: dict, args: argparse.Namespace, prompt_text: str, before_submit: Callable[[], None]):
    """Fit the start frame, then drive Dreamina through one render and return the driver's outcome."""
    width_px, height_px = fitted_frame_size_px(args.aspect_ratio)
    fitted_start_frame = helpers["fit_keyframes_to_model_frame"](
        [args.start_frame], args.output_clip.parent / FITTED_START_FRAME_SUBDIR_NAME, width_px, height_px)[0]
    print(f"Rendering in Dreamina: {args.duration_seconds}s, {args.aspect_ratio}, tier {args.resolution}...",
          flush=True)
    driver_module = helpers["dreamina_driver"]
    return driver_module.render_video_in_dreamina_web_ui(
        build_render_request(driver_module, args, prompt_text, fitted_start_frame), before_submit=before_submit)


def mark_submitted_or_stop_the_free_check(args: argparse.Namespace, status: dict) -> None:
    """Runs right before the submit: a free check stops here; a real run records that it is being paid for."""
    if args.stop_before_submit:
        raise StoppedBeforeSubmit(STOPPED_BEFORE_SUBMIT_MESSAGE)
    status["state"] = SUBMITTED_STATE
    write_status(status_path_for(args.output_clip), status)


def render_clip_and_record_status(helpers: dict, args: argparse.Namespace, prompt_text: str) -> None:
    """Record the rendering state, render the clip, then record the downloaded clip and credits.

    A free check run writes no status, so it never overwrites the record of a real run of the same clip.
    """
    status = {"started_at": datetime.now().isoformat(timespec="seconds"), "start_frame": str(args.start_frame),
              "aspect_ratio": args.aspect_ratio, "resolution_requested": args.resolution,
              "duration_seconds": args.duration_seconds, "state": RENDERING_STATE}
    if not args.stop_before_submit:
        write_status(status_path_for(args.output_clip), status)
    outcome = render_clip(helpers, args, prompt_text,
                          before_submit=lambda: mark_submitted_or_stop_the_free_check(args, status))
    status.update({"state": "downloaded", "clip_path": str(outcome.downloaded_clip_path),
                   "clip_frame_size": read_clip_frame_size(outcome.downloaded_clip_path),
                   "credit_balance_before": outcome.credit_balance_before,
                   "credit_balance_after": outcome.credit_balance_after})
    write_status(status_path_for(args.output_clip), status)
    print(f"DONE — {outcome.downloaded_clip_path} ({status['clip_frame_size']}), "
          f"credits {outcome.credit_balance_before} → {outcome.credit_balance_after}", flush=True)


def render_was_submitted(output_clip: Path) -> bool:
    """True when this run's status file has moved past rendering: the submit was reached, credits may be spent."""
    status_path = status_path_for(output_clip)
    if not status_path.is_file():
        return False
    return json.loads(status_path.read_text(encoding="utf-8")).get("state") != RENDERING_STATE


def repair_request_for(args: argparse.Namespace, failure_traceback: str, submitted: bool):
    """Describe this failure to the repair agent: what broke, how to check a fix for free, whether it was paid."""
    attempt_number = repair_loop.DEFAULT_REPAIR_ATTEMPTS_PER_RUN - args.repair_attempts_left + 1
    return repair_loop.RepairRequest(
        failure_text=failure_traceback,
        free_check_command=repair_loop.free_check_command(Path(__file__).resolve(), sys.argv[1:], Path.cwd()),
        render_was_submitted=submitted,
        attempt_number=attempt_number,
        log_path=repair_loop.repair_log_path_for(args.output_clip, attempt_number),
    )


def repair_then_rerun_or_stop(args: argparse.Namespace, failure: BaseException, failure_traceback: str) -> None:
    """Hand a script failure to the repair agent; rerun in a fresh process only when nothing was charged."""
    failure_message = repair_loop.failure_message_of(failure)
    if repair_loop.is_business_stop(failure_message):
        raise failure
    if args.repair_attempts_left <= 0:
        sys.exit(f"{failure_message}\n— no repair attempts left for this run")
    submitted = not args.stop_before_submit and render_was_submitted(args.output_clip)
    with exclusive_dreamina_render_lock(DREAMINA_RENDERER_REPAIR_ONE_AT_A_TIME_LOCK_PATH):
        verdict = repair_loop.ask_repair_agent(repair_request_for(args, failure_traceback, submitted))
    repair_loop.stop_unless_rerun_is_free(verdict, submitted, failure_message)
    # A fresh process, so the rerun imports the repaired modules instead of the ones already loaded.
    os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve()),
                              *repair_loop.arguments_for_rerun(sys.argv[1:], args.repair_attempts_left - 1)])


def main() -> None:
    """Render one landing scroll clip in Dreamina, one render at a time; a script failure goes to the repair agent."""
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    args = parse_command_line_arguments()
    helpers = preflight_imports()
    prompt_text = read_prompt_after_checking_inputs(args.start_frame, args.prompt_file)
    try:
        # Inputs are checked first so a bad call fails at once instead of queueing behind a running render.
        with exclusive_dreamina_render_lock(DREAMINA_RENDER_ONE_AT_A_TIME_LOCK_PATH):
            render_clip_and_record_status(helpers, args, prompt_text)
    except StoppedBeforeSubmit:
        print(STOPPED_BEFORE_SUBMIT_MESSAGE, flush=True)
    except (Exception, SystemExit) as failure:
        # The render lock is released by now: the repair agent's free check run takes it itself.
        repair_then_rerun_or_stop(args, failure, traceback.format_exc())


if __name__ == "__main__":
    main()
