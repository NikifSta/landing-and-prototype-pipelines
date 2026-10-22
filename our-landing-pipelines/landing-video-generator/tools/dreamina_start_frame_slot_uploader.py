#!/usr/bin/env python3
"""Put the clip's start frame into the first-frame slot of Dreamina's First and last frames mode.

The slot is the composer's "First frame" tile, not a file input (inspection recorded in the plan
2026-09-28-premium-landing-pipeline-version-5-scroll-motion.md, Task 5 Step 4): a click on it asks
for the file through the browser's File System Access picker, which Playwright cannot fill. With
that picker hidden the page falls back to an ordinary file input, whose chooser Playwright catches.
"""

from __future__ import annotations

from pathlib import Path

START_FRAME_SLOT_SELECTOR = "[class*='reference-upload-']"
# The empty slot carries this label; a slot already holding a frame no longer shows it.
START_FRAME_SLOT_LABEL = "First frame"
HIDE_FILE_SYSTEM_ACCESS_PICKER_SCRIPT = "() => { window.showOpenFilePicker = undefined; }"
# The fallback chooser opened within a second in the inspection; this bound only catches a changed page.
FILE_CHOOSER_TIMEOUT_MILLISECONDS = 10000
# The preview tile appears a moment after the file lands; the next control waits for it.
UPLOAD_SETTLE_MILLISECONDS = 3000


def attach_start_frame(page, start_frame_path: Path) -> None:
    """Upload the start frame into the empty first-frame slot and wait for its preview to settle."""
    start_frame_slot = page.locator(START_FRAME_SLOT_SELECTOR).filter(has_text=START_FRAME_SLOT_LABEL)
    if start_frame_slot.count() == 0:
        raise RuntimeError(
            "the composer shows no empty first-frame slot; is the First and last frames mode selected "
            "and the slot cleared of an earlier frame? Nothing was charged."
        )
    page.evaluate(HIDE_FILE_SYSTEM_ACCESS_PICKER_SCRIPT)
    with page.expect_file_chooser(timeout=FILE_CHOOSER_TIMEOUT_MILLISECONDS) as chooser_waiter:
        start_frame_slot.first.click()
    chooser_waiter.value.set_files(str(start_frame_path))
    page.wait_for_timeout(UPLOAD_SETTLE_MILLISECONDS)
