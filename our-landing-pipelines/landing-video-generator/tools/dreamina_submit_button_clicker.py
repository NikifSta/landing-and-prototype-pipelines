#!/usr/bin/env python3
"""Press Dreamina's submit button, found by its own class, after a read-only check that nothing covers it.

Why this module exists. The copied `dreamina_web_ui_composer_browser_mechanics` takes the rightmost small
unlabelled button at the foot of the window for the submit arrow. Inspection 29-09-2026: the duration
popup ("Total duration", now a slider and a number field with step arrows) stays open after its value is
set — Escape and moving the mouse away leave it open, only a click elsewhere closes it — and its step
arrows stand right of the submit, low enough to count as the settings bar. The copy clicked a step arrow,
the number field lay on top of it, and the run died on a 30-second timeout. The submit button names its
role in its class, so this module takes it by class; the copy stays byte-identical to its source in
video-generation.

Why the check is separate. The free check run (--stop-before-submit) stops right before the press, so
the press itself is never exercised for free. The check only reads the page — which element is on top at
the button's centre — so the driver runs it before that stop, and a missing or covered button stops the
run before anything is charged. Playwright's trial click is not used for it: a trial click still sends a
real mouse press and only blocks it inside the page.
"""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from dreamina_web_ui_composer_browser_mechanics import (  # noqa: E402
    CONTENT_RIGHTS_CONFIRM_BUTTON_SELECTOR,
    SHORT_INTERACTION_PAUSE_MILLISECONDS,
)

# The class carries a build hash after the stable part ("submit-button-Ncvn9i submit-button-eLZyyQ" on
# 29-09-2026). The page holds a second button at the same spot for the collapsed composer
# ("collapsed-submit-button-wOG90N"), hidden with visibility: hidden; `:visible` leaves the live one.
SUBMIT_BUTTON_SELECTOR = "button[class*='submit-button-']:visible"
EXPECTED_VISIBLE_SUBMIT_BUTTONS = 1
# Returns "" when the button or its own icon is on top at the button's centre, otherwise what lies there.
# getAttribute, not className: an SVG node's className is an object, not the class text.
SUBMIT_BUTTON_COVERING_ELEMENT_READER_SCRIPT = """
button => {
  const box = button.getBoundingClientRect();
  const topElement = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  if (!topElement) return 'nothing: the button centre is outside the window';
  if (button.contains(topElement)) return '';
  return `<${topElement.tagName.toLowerCase()} class="${topElement.getAttribute('class') || ''}">`;
}
"""


def stop_unless_submit_button_is_uncovered(page) -> None:
    """Stop before paying unless exactly one submit button is shown and nothing lies on top of it."""
    submit_buttons = page.locator(SUBMIT_BUTTON_SELECTOR)
    visible_submit_buttons = submit_buttons.count()
    if visible_submit_buttons != EXPECTED_VISIBLE_SUBMIT_BUTTONS:
        sys.exit(
            f"the composer shows {visible_submit_buttons} submit buttons ({SUBMIT_BUTTON_SELECTOR}) "
            f"against {EXPECTED_VISIBLE_SUBMIT_BUTTONS} — the Dreamina layout changed; nothing was charged"
        )
    covering_element = submit_buttons.first.evaluate(SUBMIT_BUTTON_COVERING_ELEMENT_READER_SCRIPT)
    if covering_element:
        sys.exit(
            f"the submit button is covered by {covering_element} — a popup stayed open or the Dreamina "
            "layout changed; nothing was charged"
        )


def press_submit_button_and_confirm_content_rights(page) -> None:
    """Press the submit button and accept the content-rights dialog that may follow it."""
    page.locator(SUBMIT_BUTTON_SELECTOR).first.click()
    page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
    confirm_button = page.locator(CONTENT_RIGHTS_CONFIRM_BUTTON_SELECTOR)
    if confirm_button.count() > 0:
        confirm_button.first.click()
        page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
