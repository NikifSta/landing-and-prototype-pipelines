"""Recognise the clip WE ordered among all the clips the Dreamina page happens to show.

Both Dreamina video routes — a fresh render and an edit of a finished clip — end the same way:
wait for our clip to appear in the feed, then hand its link back. The page also lazily loads its
own template previews, so "a link that was not there a moment ago" is not enough to identify our
result (one such preview was downloaded and delivered instead of the render on 2026-08-15). Frame
shape plus length identify it without relying on card layout.
"""
from __future__ import annotations

import sys
import time
from dataclasses import dataclass
from typing import Callable

# Both come back slightly off: the model rounds the frame and the container adds fractions of a
# second, so neither comparison can be exact.
ASPECT_RATIO_TOLERANCE = 0.05
DURATION_TOLERANCE_SECONDS = 1.5
# A refused request answers with a guideline notice where progress would be, and it never turns into
# a clip. Measured 2026-08-29: a refused render repeated that notice while the watcher waited out its
# whole timeout, holding the browser for nothing — the refusal itself costs no credits.
REFUSAL_NOTE_MARKERS = ("Community Guidelines", "violates our")
# A dead render is a different answer from a refusal: the card gives up with the provider's own
# wording and says nothing about credits, so the operator has to read the balance badge. Measured
# 2026-08-31: a 15s dance render climbed to 84%, flipped to "Something went wrong. Refresh and try
# again.", and the watcher read it as 'waiting' for 23 more minutes because nothing here matched it.
# The other three wordings were surfaced by the status reader all along with no predicate to end the
# poll on them — the same hole, just never hit.
RENDER_CRASH_NOTE_MARKERS = ("Something went wrong", "failed", "Failed", "not supported")


@dataclass
class ExpectedFinishedClipShape:
    """The frame shape and length that identify our clip in the feed."""

    aspect_ratio_label: str
    duration_seconds: float


def collect_videos_on_page(page) -> list[dict]:
    """Return every clip element on the page with its link, frame size and length."""
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('video'))
             .map(video => ({
               source: video.currentSrc || video.src,
               width: video.videoWidth,
               height: video.videoHeight,
               duration: video.duration
             }))
             .filter(video => video.source)"""
    )


def collect_video_sources(page) -> set[str]:
    """Return the links of clips already on the page, so the new one can be told apart."""
    return {video["source"] for video in collect_videos_on_page(page)}


def video_matches_expected_shape(video: dict, expected: ExpectedFinishedClipShape) -> bool:
    """True when this clip carries the frame shape and the length we ordered."""
    if not video["width"] or not video["height"] or not video["duration"]:
        return False
    wanted_width, wanted_height = (int(part) for part in expected.aspect_ratio_label.split(":"))
    if abs(video["width"] / video["height"] - wanted_width / wanted_height) > ASPECT_RATIO_TOLERANCE:
        return False
    return abs(video["duration"] - expected.duration_seconds) <= DURATION_TOLERANCE_SECONDS


def wait_for_new_matching_video_source(
    page,
    known_sources: set[str],
    expected: ExpectedFinishedClipShape,
    *,
    poll_interval_seconds: int,
    timeout_seconds: int,
    read_progress_note: Callable[[object], str],
) -> str:
    """Poll until OUR clip appears: a link that is new AND carries the ordered shape and length."""
    waiting_started = time.monotonic()
    while True:
        fresh_video_source = _first_new_matching_video_source(page, known_sources, expected)
        if fresh_video_source:
            return fresh_video_source
        elapsed_seconds = time.monotonic() - waiting_started
        progress_note = read_progress_note(page)
        if note_says_the_request_was_refused(progress_note):
            sys.exit(
                f"Dreamina refused this request: {progress_note} "
                "Nothing was charged. Replace the reference or the wording it objects to and rerun."
            )
        if note_says_the_render_crashed(progress_note):
            sys.exit(
                f"Dreamina dropped this render: {progress_note} "
                "Whether the credits were taken is unknown from here — read the balance badge "
                "before ordering the same render again."
            )
        if elapsed_seconds > timeout_seconds:
            sys.exit(
                f"Dreamina did not finish within {timeout_seconds}s — "
                "check the browser window; the credits may already be spent"
            )
        print(f"  [poll] {elapsed_seconds:.0f}s: {progress_note}", flush=True)
        time.sleep(poll_interval_seconds)


def note_says_the_request_was_refused(progress_note: str) -> bool:
    """True when Dreamina answered with a guideline refusal instead of render progress."""
    return any(marker in progress_note for marker in REFUSAL_NOTE_MARKERS)


def note_says_the_render_crashed(progress_note: str) -> bool:
    """True when the card died on a provider error instead of finishing or being refused."""
    return any(marker in progress_note for marker in RENDER_CRASH_NOTE_MARKERS)


def _first_new_matching_video_source(
    page, known_sources: set[str], expected: ExpectedFinishedClipShape
) -> str | None:
    """Return the first clip on the page that is both new and shaped like the one we ordered."""
    for video in collect_videos_on_page(page):
        if video["source"] in known_sources:
            continue
        if video_matches_expected_shape(video, expected):
            return video["source"]
    return None
