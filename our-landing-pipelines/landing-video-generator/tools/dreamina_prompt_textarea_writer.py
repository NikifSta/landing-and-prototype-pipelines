#!/usr/bin/env python3
"""Write the prompt into the plain textarea of Dreamina's First and last frames mode.

Why this module exists. The copied `dreamina_web_ui_composer_browser_mechanics` writes the prompt into
the rich-text editor (`.ProseMirror`) of the Omni reference mode. In the First and last frames mode
the composer shows a plain `<textarea>` instead (inspection 29-09-2026: the same tab held a textarea
in that mode and two `.ProseMirror` nodes after a reload put it back into Omni reference). The copied
path waited for `.ProseMirror` and every start-frame render died on a 30-second timeout before the
submit. The copy stays byte-identical to its source in video-generation, so the textarea path lives
here. The textarea has no mention menu, so a written `@Name` stays plain text.
"""

from __future__ import annotations

import sys

# The class name carries a build hash after the stable part ("prompt-textarea-VEixUf" on 29-09-2026).
PROMPT_TEXTAREA_SELECTOR = "textarea[class*='prompt-textarea-']"
# The page updates its own state after the input events; the read-back waits for that.
FILLED_TEXT_SETTLE_MILLISECONDS = 1500


def write_prompt_into_textarea(page, prompt_text: str) -> None:
    """Replace whatever the textarea holds with this prompt; stop before paying if it did not land whole.

    `fill` sets the value through input events and presses no key, so the Enter that submits in this
    composer is never sent and the line breaks of the prompt survive.
    """
    textarea = page.locator(PROMPT_TEXTAREA_SELECTOR)
    if textarea.count() == 0:
        sys.exit(
            f"the composer shows no prompt textarea ({PROMPT_TEXTAREA_SELECTOR}) — the Dreamina "
            "layout changed; nothing was charged"
        )
    textarea.first.fill(prompt_text)
    page.wait_for_timeout(FILLED_TEXT_SETTLE_MILLISECONDS)
    textarea_text = textarea.first.input_value()
    if textarea_text.strip() != prompt_text.strip():
        sys.exit(
            f"the prompt textarea holds {len(textarea_text)} characters against the prompt's "
            f"{len(prompt_text)} — nothing was charged, rerun the command"
        )
