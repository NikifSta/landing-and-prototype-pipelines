#!/usr/bin/env python3
"""Read how many reference files are REALLY attached to a Dreamina composer.

The composer's reference pile COLLAPSES: whatever the number of attached files, it draws about two
overlapping tiles and hides the rest behind a panel that lists them all. The tile count is therefore
not the number of attached references — measured 2026-08-29, a run that had really attached nine
frames saw two tiles, reported "uploaded 2 of 9" and refused a paid render that was perfectly set up.

The honest number lives in the expanded panel's tab captions, "All (N)" and "Images (N)", which exist
only while that panel is open. This module opens the panel, reads the number and folds the panel back.

Two rules follow from what that run cost:

- **An unreadable count never cancels a render.** When the panel refuses to open the reading comes
  back UNKNOWN and the caller carries on; the owner is already paying for the run, and a guard that
  cannot tell "broken" from "collapsed" is the false blocker this route has already paid for once.
- **A readable count is reported, never used as a gate.** It counts everything the composer currently
  holds, which is not always what this run sent: on 2026-08-29 the owner opened the panel by hand
  after a nine-frame upload and counted eighteen files.

Requires a live navigator session (`real-chrome-web-navigator`, launch-real-chrome-session.py).
"""

from __future__ import annotations

from dataclasses import dataclass

# The pile draws its hover-only controls — the per-reference remove buttons and the control that
# opens the full panel — only while the mouse rests on it.
REFERENCE_PILE_HOVER_TRIGGER_SELECTOR = "[class*='reference-group-hover-trigger-']"
REFERENCE_PILE_CONTENT_SELECTOR = "[class*='reference-group-content-']"
# The expanded panel's header holds two buttons: a labelled "Remove references" and one icon-only
# button (measured 2026-08-29). The icon-only one is the panel's fold-away control by layout; the
# probe that would have confirmed the click never ran, because the panel had closed on its own by
# then. That is why closing is verified by re-reading the counter instead of trusted.
PANEL_HEADER_SELECTOR = "[class*='header-actions-']"
PANEL_COLLAPSE_BUTTON_SELECTOR = f"{PANEL_HEADER_SELECTOR} button.lv-btn-icon-only"
# The panel opens and closes with a height animation; reads before it settles see the old state.
PANEL_ANIMATION_MILLISECONDS = 2500
# "All (18)" and "Images (18)" are BUTTONS in the open panel. With the pile collapsed the same query
# finds nothing at all, which is what makes this script a reliable "is the panel open" probe too.
READ_PANEL_FILE_COUNT_SCRIPT = """
() => {
  for (const node of document.querySelectorAll('button')) {
    const caption = /^(?:All|Images)\\s*\\((\\d+)\\)$/.exec((node.innerText || '').trim());
    if (caption) return Number(caption[1]);
  }
  return null;
}
"""
# The owner's words for the control: «есть кнопка показать все референсы». Its label is matched in
# both interface languages, and a length limit keeps a whole paragraph containing those words out.
CLICK_SHOW_ALL_REFERENCES_CONTROL_SCRIPT = """
() => {
  const wanted = /show all|view all|see all|показать все|все референсы/i;
  const longestLabelLength = 40;
  for (const node of document.querySelectorAll('button, div, span')) {
    const label = (node.innerText || '').trim();
    if (label && label.length <= longestLabelLength && wanted.test(label)) {
      node.click();
      return true;
    }
  }
  return false;
}
"""


@dataclass(frozen=True)
class AttachedFileCountReading:
    """What the composer could tell us about the number of attached reference files."""

    # None means the panel never opened, so the number is genuinely unknown — not zero, not a failure.
    attached_file_count: int | None
    # One plain-language line for the run log: how the number was read, or why it could not be.
    explanation: str
    # True when the panel stayed expanded, which hides the pile's tiles from the next cleanup step.
    panel_left_open: bool

    @property
    def is_known(self) -> bool:
        """True when the panel gave up a real number."""
        return self.attached_file_count is not None


def read_attached_file_count(page) -> AttachedFileCountReading:
    """Open the reference panel, read its file count and fold the panel back.

    Never raises and never exits: every way of opening the panel is best effort, and a panel that
    stays shut is reported as an unknown count rather than as a failure of the run.
    """
    already_open_count = read_panel_file_count(page)
    if already_open_count is not None:
        return _reading_after_folding_the_panel_back(
            page, already_open_count, "the panel was already open"
        )
    for attempt_description, open_the_panel in _PANEL_OPENING_ATTEMPTS:
        if not _run_browser_action_quietly(attempt_description, open_the_panel, page):
            continue
        page.wait_for_timeout(PANEL_ANIMATION_MILLISECONDS)
        file_count = read_panel_file_count(page)
        if file_count is not None:
            return _reading_after_folding_the_panel_back(
                page, file_count, f"the panel opened by {attempt_description}"
            )
    return AttachedFileCountReading(
        attached_file_count=None,
        explanation=(
            "the reference panel did not open, so only Dreamina knows the real number "
            "(the collapsed pile always draws about two tiles)"
        ),
        panel_left_open=False,
    )


def report_attached_file_count(
    page, *, files_sent: int, tiles_visible: int
) -> AttachedFileCountReading:
    """Print what is really attached before a paid render. Nothing here can stop the run."""
    reading = read_attached_file_count(page)
    print(
        f"  [references] {files_sent} sent, {tiles_visible} tile(s) visible "
        "(the pile collapses, so a smaller number here is normal)",
        flush=True,
    )
    print(f"  [references] {_honest_count_line(reading, files_sent)}", flush=True)
    if reading.panel_left_open:
        print(
            "  [references] WARNING: the reference panel stayed open — an open panel hides the "
            "pile's tiles from the cleanup step, so close it by hand before the next run",
            flush=True,
        )
    return reading


def collapse_reference_panel_if_open(page) -> bool:
    """Fold an expanded reference panel back into the pile; True when the panel ends up closed."""
    if read_panel_file_count(page) is None:
        return True
    _run_browser_action_quietly(
        "clicking the panel's fold-away button", _click_panel_collapse_button, page
    )
    page.wait_for_timeout(PANEL_ANIMATION_MILLISECONDS)
    if read_panel_file_count(page) is None:
        return True
    _run_browser_action_quietly("pressing Escape", _press_escape, page)
    page.wait_for_timeout(PANEL_ANIMATION_MILLISECONDS)
    return read_panel_file_count(page) is None


def read_panel_file_count(page) -> int | None:
    """Return the number in the open panel's tab caption, or None while the panel is closed."""
    return page.evaluate(READ_PANEL_FILE_COUNT_SCRIPT)


def _honest_count_line(reading: AttachedFileCountReading, files_sent: int) -> str:
    """Phrase the panel's answer for the run log, saying plainly when there is no answer."""
    if not reading.is_known:
        return (
            f"honest count UNKNOWN — {reading.explanation}; the render goes ahead, "
            "the pile is not empty"
        )
    if reading.attached_file_count < files_sent:
        return (
            f"WARNING: the panel lists {reading.attached_file_count} file(s) against {files_sent} "
            "sent — the render goes ahead, so check the finished clip for a missing scene"
        )
    return f"the panel lists {reading.attached_file_count} file(s) attached ({reading.explanation})"


def _reading_after_folding_the_panel_back(
    page, file_count: int, explanation: str
) -> AttachedFileCountReading:
    """Wrap a number that was read successfully, recording whether the panel closed afterwards."""
    return AttachedFileCountReading(
        attached_file_count=file_count,
        explanation=explanation,
        panel_left_open=not collapse_reference_panel_if_open(page),
    )


def _run_browser_action_quietly(description: str, browser_action, page) -> bool:
    """Run one page action, reporting a failure instead of raising — every route here is optional."""
    try:
        browser_action(page)
        return True
    # Any page error — a missing node, a covered target, a timeout — means this way did not work.
    except Exception as page_error:
        print(
            f"  [references] {description} did not work: {type(page_error).__name__}",
            flush=True,
        )
        return False


def _hover_the_reference_pile(page) -> None:
    """Rest the mouse on the pile so its hover-only controls render."""
    page.locator(REFERENCE_PILE_HOVER_TRIGGER_SELECTOR).first.hover()


def _click_show_all_references_control(page) -> None:
    """Click the pile's "show all references" control, wherever the interface has put it."""
    page.locator(REFERENCE_PILE_HOVER_TRIGGER_SELECTOR).first.hover()
    if not page.evaluate(CLICK_SHOW_ALL_REFERENCES_CONTROL_SCRIPT):
        raise LookupError("no control labelled 'show all references' is on the page")


def _click_the_reference_pile(page) -> None:
    """Click the pile itself, which opens the panel in some builds of the interface."""
    page.locator(REFERENCE_PILE_CONTENT_SELECTOR).first.click(force=True)


def _click_panel_collapse_button(page) -> None:
    """Click the icon-only button beside "Remove references" in the open panel's header."""
    page.locator(PANEL_COLLAPSE_BUTTON_SELECTOR).first.click()


def _press_escape(page) -> None:
    """Last resort for closing the panel when its own button does not answer."""
    page.keyboard.press("Escape")


# Tried in this order, cheapest and least destructive first. Every one of them was measured as
# insufficient on its own on 2026-08-29, which is why the unknown outcome is a first-class result
# and not an error.
_PANEL_OPENING_ATTEMPTS = (
    ("hovering the reference pile", _hover_the_reference_pile),
    ("clicking the 'show all references' control", _click_show_all_references_control),
    ("clicking the reference pile itself", _click_the_reference_pile),
)
