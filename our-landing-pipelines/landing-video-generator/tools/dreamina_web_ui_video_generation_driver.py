#!/usr/bin/env python3
"""Drive the Dreamina (CapCut) web interface in the live Chrome session to render ONE video.

Why a browser instead of an API call: the BytePlus console that sells Seedance 2.5 refuses account
registration from this machine's datacenter address, while dreamina.capcut.com is already signed in
inside the navigator's Chrome profile (verified 2026-08-14). The web interface also accepts up to
50 references per request against the nine of the fal endpoint, returns a far higher bitrate, and
bills the owner's credit balance instead of the fal card. Its clips declare a 60 fps timebase but
carry 24 fps of picture (241 frames over 10.02s, measured 2026-08-15) — the earlier "60 fps" note
read the container's timebase, not the footage.

The module owns the VIDEO composer's own controls — engine, mode, frame, duration, and recognising
the finished clip. Everything both composers share (session, settings bar, references, prompt,
submit, credits, download) lives in `dreamina_web_ui_composer_browser_mechanics`.

It holds ONE connection for the whole render because the finished clip lives on a CDN link bound to
that browser session: a bare HTTP client cannot fetch it.

Requires a live navigator session (`real-chrome-web-navigator`, launch-real-chrome-session.py).

Landing copy (2026-09-28): start-frame mode puts the single frame into its own slot; the resolution
tier "highest" picks the highest tier the popup offers. The credit check moved from right after the
page opens to right after the engine and mode are picked and the tier is resolved (a read-only look
at the frame popup for "highest"), and it prices that tier: the copy priced every run at 720p while
rendering 1080P. It still runs before the start frame is uploaded and long before the submit, so a
refused run charges nothing and leaves no frame in the slot. The tier-setting step now gets the
concrete tier instead of resolving "highest" itself. The balance, before and after the render, is read
by `dreamina_credit_balance_badge_reader`, not by `composer.read_credit_balance`: Dreamina moved the
badge from the foot of the left rail to the top right ("18.9K Standard"), where the copied reader finds
nothing and the credit check would stop every run; the composer stays a byte copy of its source.
For the same reason the start-frame prompt goes through `dreamina_prompt_textarea_writer`: that mode
shows a plain textarea, not the copied composer's rich-text editor (29-09-2026). The submit goes
through `dreamina_submit_button_clicker`: the copied composer takes the rightmost small unlabelled button
of the bar, and on 29-09-2026 that was a step arrow of the duration popup, which Escape no longer closes.
`dreamina_paid_plan_requirement_checker` stops a run whose model needs a plan the account lacks: on
19-10-2026 the plan had lapsed, the submit opened the plans drawer instead of a render, and the watcher
waited out its whole timeout.
"""

from __future__ import annotations

import re
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import dreamina_credit_balance_badge_reader as credit_badge_reader
import dreamina_credit_balance_sufficiency_preflight as credit_preflight
import dreamina_paid_plan_requirement_checker as paid_plan_checker
import dreamina_prompt_textarea_writer as prompt_textarea_writer
import dreamina_web_ui_composer_browser_mechanics as composer
import dreamina_web_ui_finished_clip_watcher as clip_watcher
import dreamina_render_settings as settings
import dreamina_start_frame_slot_uploader as start_frame_slot
import dreamina_submit_button_clicker as submit_button_clicker

VIDEO_GENERATION_PAGE_URL = "https://dreamina.capcut.com/ai-tool/generate/?type=video"
# Settings-bar controls are matched by what they CURRENTLY show, because that is whatever the
# previous render left behind — the engine name, the frame, the length.
MODEL_CONTROL_LABEL_PATTERN = r"Dreamina Seedance [\d.]+.*"
MODE_CONTROL_LABEL_PATTERN = r"(Omni reference|First and last.*|Multiframes|Smart edit.*|Long video.*)"
# In the First and last frames mode the frame part reads "Auto" while the shape comes from the
# start frame (inspection 2026-09-28), so the pattern takes it next to a ratio such as "16:9".
FRAME_CONTROL_LABEL_PATTERN = r"(\d+:\d+|Auto) \| \d+P"
DURATION_CONTROL_LABEL_PATTERN = r"\d+s"
# Mode that renders a fresh clip from picture references — the default route's mode.
REFERENCE_TO_VIDEO_MODE_LABEL = "Omni reference"
# A resolution tier in the frame popup reads like "720P".
RESOLUTION_OPTION_PATTERN = re.compile(r"^(\d{3,4})P$")


@dataclass
class DreaminaRenderRequest:
    """Everything the web interface needs for one render."""

    reference_image_paths: list[Path]
    prompt_text: str
    duration_seconds: int
    aspect_ratio_label: str
    resolution_label: str
    model_label: str
    generation_mode_label: str
    output_clip_path: Path
    poll_interval_seconds: int
    render_timeout_seconds: int
    # True when a VIDEO is among the references — the dance route's leading motion video. Dreamina
    # bills such a run at twice the per-second rate, so the credit check must know about it.
    render_consumes_video_input: bool


@dataclass
class DreaminaRenderOutcome:
    """What one finished render produced."""

    video_source_url: str
    downloaded_clip_path: Path
    credit_balance_before: str
    credit_balance_after: str


def render_video_in_dreamina_web_ui(
    request: DreaminaRenderRequest, before_submit: Callable[[], None] | None = None
) -> DreaminaRenderOutcome:
    """Fill the composer, start one render, wait for the clip and download it through the browser.

    `before_submit` runs right before the submit is pressed: the renderer marks the run as paid there,
    or stops a free check run before anything is charged.
    """
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = composer.connect_to_live_chrome(playwright)
        try:
            page = composer.open_composer_page(browser, VIDEO_GENERATION_PAGE_URL)
            balance_before = credit_badge_reader.read_credit_balance(page)
            _select_engine_and_mode(page, request)
            resolution_label = _resolve_resolution_tier(page, request.resolution_label)
            credit_preflight.stop_unless_credit_balance_covers_the_render(
                balance_before, request.duration_seconds, request.render_consumes_video_input, resolution_label
            )
            paid_plan_checker.stop_if_account_lacks_the_plan_the_model_needs(page)
            _prepare_composer(page, request, resolution_label)
            known_video_sources = clip_watcher.collect_video_sources(page)
            # Read-only and ahead of the hook, so the free check run proves the submit is reachable too.
            submit_button_clicker.stop_unless_submit_button_is_uncovered(page)
            if before_submit is not None:
                before_submit()
            submit_button_clicker.press_submit_button_and_confirm_content_rights(page)
            video_source_url = clip_watcher.wait_for_new_matching_video_source(
                page,
                known_video_sources,
                _expected_shape_of(request),
                poll_interval_seconds=request.poll_interval_seconds,
                timeout_seconds=request.render_timeout_seconds,
                read_progress_note=read_progress_note_unless_plans_drawer_opened,
            )
            composer.download_through_browser(page, video_source_url, request.output_clip_path)
            return DreaminaRenderOutcome(
                video_source_url=video_source_url,
                downloaded_clip_path=request.output_clip_path,
                credit_balance_before=balance_before,
                credit_balance_after=credit_badge_reader.read_credit_balance(page),
            )
        finally:
            # Disconnect only — the navigator's Chrome must survive for the next call.
            browser.close()


def read_progress_note_unless_plans_drawer_opened(page) -> str:
    """The newest card's status line for the watcher; stops at once when the submit opened the plans drawer."""
    paid_plan_checker.stop_if_plans_drawer_opened(page)
    return composer.read_progress_note(page)


def _select_engine_and_mode(page, request: DreaminaRenderRequest) -> None:
    """Pick the engine and the generation mode; the tiers the frame popup offers depend on both."""
    composer.select_settings_bar_option(page, MODEL_CONTROL_LABEL_PATTERN, request.model_label)
    composer.select_settings_bar_option(
        page, MODE_CONTROL_LABEL_PATTERN, request.generation_mode_label
    )


def _resolve_resolution_tier(page, requested_label: str) -> str:
    """The concrete tier to price and render: the requested one, or the highest the popup offers.

    Only reads the popup and closes it: a popup whose option was clicked can stay open, and the next
    click on the frame control would then shut it instead (measurement 2026-09-28).
    """
    if requested_label != settings.HIGHEST_OFFERED_RESOLUTION:
        return requested_label
    composer.click_settings_bar_control(page, FRAME_CONTROL_LABEL_PATTERN)
    popup = composer.open_popup_below_heading(page, "Aspect ratio")
    highest_offered_label = pick_resolution_label(popup, requested_label)
    composer.close_open_settings_popup(page)
    return highest_offered_label


def _prepare_composer(page, request: DreaminaRenderRequest, resolution_label: str) -> None:
    """Put this render's references, frame, tier, duration and prompt into the composer."""
    _attach_inputs_for_mode(page, request)
    _set_frame_and_resolution(page, _aspect_ratio_to_pick(request), resolution_label)
    _set_duration(page, request.duration_seconds)
    _write_prompt_for_mode(page, request)


def _write_prompt_for_mode(page, request: DreaminaRenderRequest) -> None:
    """Start-frame mode shows a plain textarea; the reference mode keeps the rich-text editor with mentions."""
    if request.generation_mode_label == settings.DREAMINA_START_FRAME_MODE_LABEL:
        prompt_textarea_writer.write_prompt_into_textarea(page, request.prompt_text)
        return
    composer.type_prompt(page, request.prompt_text)


def _attach_inputs_for_mode(page, request: DreaminaRenderRequest) -> None:
    """Start-frame mode takes one frame in its own slot; the reference mode takes the reference pile."""
    if request.generation_mode_label == settings.DREAMINA_START_FRAME_MODE_LABEL:
        start_frame_slot.attach_start_frame(page, request.reference_image_paths[0])
        return
    composer.attach_references(page, request.reference_image_paths)


def _aspect_ratio_to_pick(request: DreaminaRenderRequest) -> str | None:
    """None in start-frame mode: the popup greys the ratios out there and the start frame sets the shape."""
    if request.generation_mode_label == settings.DREAMINA_START_FRAME_MODE_LABEL:
        return None
    return request.aspect_ratio_label


def pick_resolution_label(popup, requested_label: str) -> str:
    """Return the requested tier, or the highest tier the popup offers when asked for the highest."""
    if requested_label != settings.HIGHEST_OFFERED_RESOLUTION:
        return requested_label
    offered_labels = [text.strip() for text in popup.get_by_text(RESOLUTION_OPTION_PATTERN).all_inner_texts()]
    tiers = [label for label in offered_labels if RESOLUTION_OPTION_PATTERN.match(label)]
    if not tiers:
        raise RuntimeError("the Aspect ratio popup shows no resolution tier like '720P'")
    return max(tiers, key=lambda label: int(RESOLUTION_OPTION_PATTERN.match(label).group(1)))


def _set_frame_and_resolution(page, aspect_ratio_label: str | None, resolution_label: str) -> None:
    """Set the resolution tier and, unless the start frame sets it, the frame shape; one popup holds both."""
    composer.click_settings_bar_control(page, FRAME_CONTROL_LABEL_PATTERN)
    popup = composer.open_popup_below_heading(page, "Aspect ratio")
    # Открытый попап накрыт замком фокуса, и настоящий клик по строке варианта в него не проходит
    # (30-08-2026, «data-focus-lock-disabled … intercepts pointer events»).
    for option_label in [label for label in (aspect_ratio_label, resolution_label) if label]:
        composer.click_even_when_an_overlay_covers_it(popup.get_by_text(option_label, exact=True).first)
        page.wait_for_timeout(composer.SHORT_INTERACTION_PAUSE_MILLISECONDS)
    frame_note = aspect_ratio_label or "from the start frame"
    print(f"  frame {frame_note}, resolution tier {resolution_label}", flush=True)
    composer.close_open_settings_popup(page)


def _set_duration(page, duration_seconds: int) -> None:
    """Type the clip length into the duration popup; the credit price updates from it."""
    composer.click_settings_bar_control(page, DURATION_CONTROL_LABEL_PATTERN)
    popup = composer.open_popup_below_heading(page, "Total duration")
    duration_input = popup.locator("input").first
    duration_input.fill(str(duration_seconds))
    duration_input.press("Enter")
    page.wait_for_timeout(composer.SHORT_INTERACTION_PAUSE_MILLISECONDS)
    composer.close_open_settings_popup(page)


def _expected_shape_of(request: DreaminaRenderRequest) -> clip_watcher.ExpectedFinishedClipShape:
    """Describe the clip this request ordered, so the watcher can pick it out of the feed."""
    return clip_watcher.ExpectedFinishedClipShape(
        aspect_ratio_label=request.aspect_ratio_label,
        duration_seconds=request.duration_seconds,
    )
