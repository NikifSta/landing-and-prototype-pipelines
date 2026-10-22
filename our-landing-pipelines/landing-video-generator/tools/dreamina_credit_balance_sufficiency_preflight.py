#!/usr/bin/env python3
"""Stops a Dreamina run before the paid submit arrow when the credit balance cannot cover it.

Why this exists. Until 2026-08-30 the balance was only READ off the badge in the left rail and
printed into the run log — no number was ever compared with the price of the run. A run started on
too few credits therefore spent what was there and died in the middle: the dance measurements of
30-08 lost about 3800 credits to renders that reached 99% and returned no clip at all.

The price rule (owner's explanation 2026-08-30): 37 credits per second at 720p when only pictures
go in, twice that when a VIDEO goes in — the dance route's leading motion video, or Smart edit's
finished clip. Both rates live in `dreamina_render_settings`, never as numbers here.

Discounts the interface sometimes shows before submission are deliberately ignored: the check
counts the FULL price, or a discount that fails to appear would put the shortfall right back.

Landing copy (2026-09-28): the price depends on the resolution tier, and the landing route renders
at the highest tier the page offers, so pricing every run at the 720p rate let a 1080P render through
on a balance that covers only 720p. The check now takes the tier the run renders and prices it from
the full per-tier rates in `dreamina_render_settings` (measured in the composer 2026-09-28); a tier
without a measured rate stops the run before anything is charged. The video-input multiplier is
applied to every tier as before. The unreadable-badge message now sends the owner to the balance at
the top right of the page, where Dreamina draws it now; the landing driver reads it with
`dreamina_credit_balance_badge_reader`.
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import dreamina_render_settings as settings

# The badge writes either a plain number ("1234") or thousands with one decimal ("3.8K"). Anything
# else — including the "unknown" that the badge reader returns when no badge was drawn —
# fails this pattern and is treated as no balance at all.
CREDIT_BADGE_PATTERN = re.compile(r"^(\d+(?:\.\d+)?)(K?)$")
CREDIT_BADGE_THOUSANDS_SUFFIX = "K"
CREDITS_PER_BADGE_THOUSANDS_UNIT = 1000
# Smallest step the thousands form of the badge can show is one decimal of a thousand — 100 credits.
CREDITS_PER_BADGE_THOUSANDS_DIGIT_STEP = 100
# The badge ROUNDS to that step, so "3.8K" is any balance from 3750 to 3849: it can overstate the
# real balance by half a step. Only the bottom of the range is safe to spend against, so this much
# is subtracted before the comparison.
CREDITS_A_ROUNDED_BADGE_MAY_OVERSTATE = CREDITS_PER_BADGE_THOUSANDS_DIGIT_STEP // 2


def full_price_in_credits(
    duration_seconds: float, render_consumes_video_input: bool, resolution_label: str
) -> int:
    """Credits one run costs at full price at this resolution tier, rounded up to a whole credit.

    `render_consumes_video_input` is True for every run that takes a video IN: the dance route with
    its leading motion video and the Smart edit of a finished clip.
    """
    credits_per_second = measured_full_credits_per_second(resolution_label)
    if render_consumes_video_input:
        credits_per_second *= settings.DREAMINA_VIDEO_INPUT_CREDIT_MULTIPLIER
    return math.ceil(duration_seconds * credits_per_second)


def measured_full_credits_per_second(resolution_label: str) -> int:
    """Full per-second rate of this tier with pictures only; stops the run when it was never measured."""
    rates_by_tier = settings.DREAMINA_FULL_CREDITS_PER_SECOND_WITHOUT_VIDEO_INPUT_BY_RESOLUTION
    if resolution_label not in rates_by_tier:
        sys.exit(
            f"no measured Dreamina price for the resolution tier {resolution_label!r} (measured: "
            f"{', '.join(rates_by_tier)}), so the credit check cannot price this run — nothing was "
            "charged. Read the tier's full price in the composer, add it to dreamina_render_settings.py "
            "and rerun, or ask for a measured tier."
        )
    return rates_by_tier[resolution_label]


def worst_case_credits_behind_badge(credit_badge_text: str) -> int | None:
    """Smallest balance the badge could be showing; None when the badge carries no number at all.

    "unknown" (what the badge reader returns after every read retry failed) lands in the None case.
    """
    badge = CREDIT_BADGE_PATTERN.match(credit_badge_text.strip())
    if badge is None:
        return None
    shown_number, thousands_suffix = badge.group(1), badge.group(2)
    if thousands_suffix != CREDIT_BADGE_THOUSANDS_SUFFIX:
        return int(float(shown_number))
    shown_credits = float(shown_number) * CREDITS_PER_BADGE_THOUSANDS_UNIT
    return int(shown_credits - CREDITS_A_ROUNDED_BADGE_MAY_OVERSTATE)


def stop_unless_credit_balance_covers_the_render(
    credit_badge_text: str, duration_seconds: float, render_consumes_video_input: bool, resolution_label: str
) -> int:
    """Return the full price of this run at its resolution tier, or stop it before anything is charged.

    Fail closed on an unreadable badge: an unknown balance is not a green light. The run is never
    shortened or split to fit — the owner is told what it needs and what is there, and he decides.
    """
    price_in_credits = full_price_in_credits(duration_seconds, render_consumes_video_input, resolution_label)
    available_credits = worst_case_credits_behind_badge(credit_badge_text)
    if available_credits is None:
        sys.exit(
            f"the Dreamina credit badge could not be read (it shows {credit_badge_text!r}), so the "
            f"{price_in_credits} credits this run needs cannot be confirmed — nothing was charged. "
            "Open the interface, check the balance at the top right of the page and rerun."
        )
    if available_credits < price_in_credits:
        sys.exit(
            f"not enough Dreamina credits: this run needs {price_in_credits} at full price "
            f"({duration_seconds}s at {resolution_label}, video on the input: "
            f"{'yes' if render_consumes_video_input else 'no'}), and the badge {credit_badge_text!r} "
            f"guarantees only {available_credits} — nothing was charged. Top the balance up and "
            "rerun the same command; the run is not shortened to fit."
        )
    return price_in_credits
