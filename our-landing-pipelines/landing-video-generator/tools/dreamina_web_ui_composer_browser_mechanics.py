#!/usr/bin/env python3
"""Browser mechanics shared by both Dreamina (CapCut) composers — the video one and the image one.

Dreamina builds its video page and its image page from the same composer: one settings bar pinned to
the foot of the window, one reference pile, one rich-text prompt editor, one round submit arrow, one
credit badge in the left rail. Only the controls inside the bar and the kind of artifact produced
differ, so everything that is pure page mechanics lives here and each driver adds its own part.

This module owns browser mechanics only — no prompt writing, no Telegram, no run bookkeeping. It is
a thin contract layer over one web page, which is why it carries more small public functions than a
normal module: every one of them is a single click, read or upload on that page.

Requires a live navigator session (`real-chrome-web-navigator`, launch-real-chrome-session.py).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

NAVIGATOR_SCRIPTS_DIR = Path.home() / ".claude" / "skills" / "real-chrome-web-navigator" / "scripts"
SCRIPT_DIR = Path(__file__).resolve().parent
for scripts_dir in (NAVIGATOR_SCRIPTS_DIR, SCRIPT_DIR):
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

import dreamina_reference_panel_attached_file_count_reader as reference_panel

# The composer's settings bar collapses into a horizontal scroller in a narrow window, which hides
# the controls from clicking. These metrics keep the whole bar on screen.
VIEWPORT_WIDTH_PX = 1680
VIEWPORT_HEIGHT_PX = 1050
# Everything below this share of the window height belongs to the composer's settings bar; the
# generated cards above it repeat the same labels ("16:9", "5s") and must never be clicked.
SETTINGS_BAR_TOP_FRACTION_OF_WINDOW = 0.9
PROMPT_EDITOR_SELECTOR = ".ProseMirror"
# A saved element is written in the prompt as "@Name" and picked from the composer's mention menu;
# the interface caps an element name at twenty characters.
ELEMENT_MENTION_PATTERN = re.compile(r"@([A-Za-z][A-Za-z0-9_]{0,19})")
# Typing the whole name is unnecessary — the menu narrows to one row after a few characters.
ELEMENT_MENTION_TYPED_PREFIX_LENGTH = 4
# The mention menu refuses to open when a chip already stands to the RIGHT of the caret, so chips
# are built append-only, in reading order, always at the end of what is already inserted. Two chips
# in one prompt are what this route has proven (30-08-2026, Ivan plus the Zhiznmart raccoon); the
# cap stays at the measured number instead of an invented one.
MAX_ELEMENT_MENTIONS_PER_PROMPT = 2
# Picking a row from the mention menu also erases a few characters to the LEFT of the typed "@Iva"
# ("element" arrived as "eleme", measured 2026-08-29). A chip that follows prose is therefore
# preceded by this many spaces, which absorb the loss instead of the prose; the leftover spaces
# collapse in the word-level editor check.
MENTION_DELETION_GUARD_SPACES = 8
# The menu is drawn per keystroke and lags behind fast input, so keys go in at a human pace.
MENTION_KEYSTROKE_DELAY_MILLISECONDS = 120
MENTION_MENU_SETTLE_MILLISECONDS = 2500
# The menu is polled this many times before the run gives up on the element.
MENTION_MENU_POLL_ATTEMPTS = 5
# A long insertion renders after the call returns; the next keystroke waits this long for it.
INSERTED_TEXT_RENDER_MILLISECONDS = 3000
REFERENCE_FILE_INPUT_SELECTOR = "input[type=file]"
# Отправка файлов в композер ждёт дольше обычного действия: ведущее видео движения весит
# десятки мегабайт, и на его передачу браузеру тридцати секунд не хватает.
FILE_UPLOAD_TIMEOUT_MILLISECONDS = 300000
# Attached references stack into one overlapping pile. Counting the pictures inside it undercounts:
# measured 2026-08-29, three attached frames drew only two <img> because the collapsed pile renders a
# picture for the top two tiles only, and the run stopped claiming "uploaded 2 of 3". The tile that
# holds one reference is the honest unit, and its inner content node appears exactly once per file.
ATTACHED_REFERENCE_TILE_SELECTOR = "[class*='reference-item-content-']"
# The pile ends with an "add reference" tile that carries the same class as a real reference, so a
# plain tile count is always one too high: measured 2026-08-29, two uploaded frames were reported as
# "uploaded 3 of 2" and the run stopped before a paid render. The add tile is the only tile with a
# label on it ("Reference"), so an empty label is what marks a tile as a real attached file. The
# picture cannot mark it: the collapsed pile draws a thumbnail for its top two tiles only.
COUNT_ATTACHED_REFERENCES_SCRIPT = """
() => Array.from(document.querySelectorAll("[class*='reference-item-content-']"))
        .filter((tile) => !(tile.innerText || "").trim()).length
"""
# Each attached reference carries a remove button that only becomes visible on hover, and once the
# pile expands the thumbnails cover the hover target — so removal is clicked from inside the page.
REMOVE_ONE_REFERENCE_SCRIPT = """
() => {
  const button = document.querySelector("[class*='remove-button-container-']");
  if (!button) return false;
  button.click();
  return true;
}
"""
# The remove buttons exist only while the pile is hovered (measured 2026-08-29): without hovering,
# the removal loop found nothing, returned as if the pile were empty and left the previous run's
# references on the next paid render. The hover trigger is declared in the panel reader.
MAXIMUM_REFERENCES_TO_CLEAR = 50
# A real mouse click that lands on an overlay is retried by Playwright until this runs out; the
# default thirty seconds are pure waiting before the DOM-click fallback, so the wait is kept short.
INTERCEPTED_CLICK_TIMEOUT_MILLISECONDS = 5000
CONTENT_RIGHTS_CONFIRM_BUTTON_SELECTOR = "button:has-text('Confirm')"
# The credit badge is rendered after the rest of the page, so the balance is read with retries.
CREDIT_BALANCE_READ_ATTEMPTS = 5
SHORT_INTERACTION_PAUSE_MILLISECONDS = 1500
# The pile is read this often while the uploads land — heavy frames took over twenty seconds to
# appear in the pile on 2026-08-29.
UPLOAD_SETTLE_POLL_INTERVAL_MILLISECONDS = 4000
# The wait ends once the pile has been UNCHANGED for this many reads. A fixed budget of reads was
# not enough for a nine-frame pack of 43 MB (measured 2026-08-29), and the number of tiles cannot
# be compared with the number of files sent because the pile collapses to about two tiles.
UPLOAD_STALLED_POLL_ATTEMPTS = 4
# An absolute ceiling so a broken page cannot hold the browser forever.
UPLOAD_SETTLE_MAX_POLL_ATTEMPTS = 150
DEFAULT_ACTION_TIMEOUT_MILLISECONDS = 30000
# The submit arrow is a small circle with no label; wrappers around the dropdowns are wider.
SUBMIT_ARROW_MAX_SIDE_PX = 60


def connect_to_live_chrome(playwright):
    """Attach to the already-running navigator Chrome, failing loudly when no session is live."""
    from browser_environment_config import build_browser_environment_config
    from live_chrome_session_state import read_session_state
    from live_session_liveness_probe import is_recorded_session_live

    config = build_browser_environment_config()
    if not is_recorded_session_live(read_session_state(config.session_state_file)):
        sys.exit(
            "no live Chrome session — start one first:\n"
            "  ~/google-login-automation/venv/bin/python "
            "~/.claude/skills/real-chrome-web-navigator/scripts/launch-real-chrome-session.py"
        )
    return playwright.chromium.connect_over_cdp(f"http://localhost:{config.debug_port}")


def open_composer_page(browser, composer_page_url: str):
    """Open one composer in the live browser and widen the window so its settings bar fits."""
    context = browser.contexts[0]
    context.set_default_timeout(DEFAULT_ACTION_TIMEOUT_MILLISECONDS)
    page = context.pages[0] if context.pages else context.new_page()
    page.goto(composer_page_url, wait_until="domcontentloaded")
    cdp_session = context.new_cdp_session(page)
    cdp_session.send(
        "Emulation.setDeviceMetricsOverride",
        {
            "width": VIEWPORT_WIDTH_PX,
            "height": VIEWPORT_HEIGHT_PX,
            "deviceScaleFactor": 1,
            "mobile": False,
        },
    )
    page.wait_for_selector(PROMPT_EDITOR_SELECTOR)
    return page


def click_settings_bar_control(page, control_label_pattern: str) -> None:
    """Click the settings-bar control whose CURRENT label matches this pattern.

    The control is matched by pattern, not by the value we want, because the bar shows what the
    previous generation left there ("8s", "16:9 | 480P"). Geometry does the other half of the
    disambiguation: finished cards higher on the page repeat the very same labels, and clicking one
    of those opens a preview instead of the control.
    """
    settings_bar_top = _settings_bar_top_of(page)
    for element in page.query_selector_all("div, button, span"):
        box = element.bounding_box()
        if not box or box["y"] < settings_bar_top:
            continue
        element_label = (element.inner_text() or "").strip().replace("\n", " | ")
        if not re.fullmatch(control_label_pattern, element_label):
            continue
        click_even_when_an_overlay_covers_it(element)
        page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
        return
    sys.exit(
        f"no settings-bar control matches /{control_label_pattern}/ — the Dreamina layout changed"
    )


def click_even_when_an_overlay_covers_it(element) -> None:
    """Click the control, falling back to a DOM click when something floats over it.

    A video reference in the pile draws an inline player, and its volume and zoom controls hang over
    the settings bar: 30-08-2026 the real mouse click on the aspect-ratio control retried for thirty
    seconds against "intercepts pointer events" and killed the run before any charge. A DOM click
    reaches the control through the overlay, and this app answers it — the pile's own remove buttons
    are clicked the same way.
    """
    try:
        element.click(timeout=INTERCEPTED_CLICK_TIMEOUT_MILLISECONDS)
    except PlaywrightTimeoutError:
        # focus() first, because the prompt editor needs the caret and a bare click does not put it
        # there through the overlay; on a plain control focus() is a no-op.
        element.evaluate("node => { node.focus?.(); node.click(); }")


def close_open_settings_popup(page) -> None:
    """Dismiss the settings popup so its focus lock stops covering the rest of the composer.

    A popup dismissed by a real click closes itself; one dismissed by a DOM click can stay open, and
    its focus lock then swallows every later click on the page — 30-08-2026 the prompt editor could
    not be clicked at all because the frame popup was still up.
    """
    page.keyboard.press("Escape")
    page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)


def select_settings_bar_option(page, control_label_pattern: str, option_label: str) -> None:
    """Open a settings-bar dropdown and pick one option; a control already set is left alone."""
    if settings_bar_shows(page, option_label):
        return
    click_settings_bar_control(page, control_label_pattern)
    click_even_when_an_overlay_covers_it(page.get_by_text(option_label, exact=True).last)
    page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)


def settings_bar_shows(page, label: str) -> bool:
    """True when the settings bar already displays this exact label."""
    settings_bar_top = _settings_bar_top_of(page)
    for element in page.query_selector_all("div, button, span"):
        box = element.bounding_box()
        if box and box["y"] >= settings_bar_top and (element.inner_text() or "").strip() == label:
            return True
    return False


def open_popup_below_heading(page, heading_text: str):
    """Return the popup panel that carries this heading (heading's second ancestor holds it all)."""
    return page.locator(
        f"xpath=//*[normalize-space(text())='{heading_text}']/ancestor::div[2]"
    ).first


def attach_references(page, reference_image_paths: list[Path]) -> None:
    """Clear leftover references from the previous run, then upload this run's images in order.

    The pile COLLAPSES: however many files are attached, it draws about two tiles and hides the rest
    behind a "show all references" panel. So the visible tile count is NOT the number of attached
    references and must never gate a paid render — measured 2026-08-29, a run that had really
    attached all nine frames reported "uploaded 2 of 9" and refused to render. An empty pile is
    still an honest failure and still stops the run. The honest number is read afterwards out of
    that panel by the panel reader and only PRINTED: a count it cannot read is reported as unknown,
    and neither outcome cancels the render.
    """
    _clear_attached_references(page)
    if not reference_image_paths:
        # Текстовый рендер: прикреплять нечего, а пустая посылка файлов уронила бы заход на
        # проверке «ни один референс не дошёл до композера».
        print("  no references to attach — text-only render", flush=True)
        return
    # Видео движения весит десятки мегабайт против сотен килобайт у кадра, и обычного таймаута
    # действия на него не хватает: 30-08-2026 ведущее видео на 18 МБ уронило загрузку по
    # Timeout 30000ms. Отправка файлов ждёт отдельно и дольше.
    page.set_input_files(
        REFERENCE_FILE_INPUT_SELECTOR,
        [str(path) for path in reference_image_paths],
        timeout=FILE_UPLOAD_TIMEOUT_MILLISECONDS,
    )
    visible_count = _wait_until_references_stop_landing(page)
    if visible_count == 0:
        sys.exit(
            f"none of the {len(reference_image_paths)} references reached the composer — "
            "nothing was charged, rerun the command"
        )
    reference_panel.report_attached_file_count(
        page, files_sent=len(reference_image_paths), tiles_visible=visible_count
    )


def _wait_until_references_stop_landing(page) -> int:
    """Wait until the pile stops changing and report how many tiles it draws.

    The count cannot be compared against the number of files sent, because the pile collapses. What
    the wait can tell is when the uploads finished: while the pile is still changing it keeps
    waiting, and it returns once the picture has been still for several reads.
    """
    visible_count = 0
    reads_without_change = 0
    for _ in range(UPLOAD_SETTLE_MAX_POLL_ATTEMPTS):
        page.wait_for_timeout(UPLOAD_SETTLE_POLL_INTERVAL_MILLISECONDS)
        pile_count = count_attached_references(page)
        reads_without_change = 0 if pile_count != visible_count else reads_without_change + 1
        visible_count = pile_count
        if visible_count and reads_without_change >= UPLOAD_STALLED_POLL_ATTEMPTS:
            break
    return visible_count


def count_attached_references(page) -> int:
    """Count the files attached to the composer, ignoring the pile's "add reference" tile."""
    return page.evaluate(COUNT_ATTACHED_REFERENCES_SCRIPT)


def type_prompt(page, prompt_text: str) -> None:
    """Replace whatever the composer still holds with this run's prompt.

    The text is INSERTED, never typed key by key: in this composer the Enter key submits, so typing
    a multi-paragraph prose scenario fires a paid generation at every blank line (learned the
    expensive way on 2026-08-14). Insertion carries the line breaks without a single keypress.

    A `@Name` written in the prompt is NOT a saved element by itself: inserted as plain text it
    stays plain text (measured 2026-08-29, the editor kept `<p>Test @Ivan walks.</p>`). Every such
    name is therefore typed into the composer's mention menu and picked from it, which turns it into
    the element chip that carries the saved identity into the render.
    """
    editor = page.locator(PROMPT_EDITOR_SELECTOR).first
    _empty_the_prompt_editor(page, editor)
    _insert_prompt_turning_element_names_into_chips(page, prompt_text)
    page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
    verify_editor_holds_prompt(editor, prompt_text)


def _empty_the_prompt_editor(page, editor) -> None:
    """Leave the composer empty, whatever the previous run left in it.

    Measured 2026-08-29: a plain click plus Control+A missed an element chip left from an earlier
    attempt and the old text survived into the next prompt. Moving the caret to the end first, then
    selecting and erasing, clears chips as well as text.
    """
    click_even_when_an_overlay_covers_it(editor)
    page.keyboard.press("Control+End")
    page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")
    page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)


def _insert_prompt_turning_element_names_into_chips(page, prompt_text: str) -> None:
    """Insert the prompt in reading order, replacing every `@Name` with its element chip.

    Every chip is made at the END of what is already in the editor, so nothing ever stands to the
    right of the caret and the mention menu always opens (it stays shut when a chip sits to the
    right — measured 2026-08-29). Picking a row erases a few characters to the left as well, so a
    pad of spaces goes in ahead of every chip that follows prose and is eaten instead of the prose.
    """
    mentions = list(ELEMENT_MENTION_PATTERN.finditer(prompt_text))
    if not mentions:
        _insert_text_and_let_the_editor_catch_up(page, prompt_text)
        return
    if len(mentions) > MAX_ELEMENT_MENTIONS_PER_PROMPT:
        sys.exit(
            f"the prompt mentions {len(mentions)} elements and this composer accepts "
            f"{MAX_ELEMENT_MENTIONS_PER_PROMPT} — nothing was charged, name the extra element once "
            "and describe it in words after that"
        )
    page.keyboard.press("Control+Home")
    inserted_up_to = 0
    for mention in mentions:
        _insert_text_and_let_the_editor_catch_up(page, prompt_text[inserted_up_to : mention.start()])
        _append_element_chip(page, mention.group(1), prose_stands_to_the_left=mention.start() > 0)
        inserted_up_to = mention.end()
    _insert_text_and_let_the_editor_catch_up(page, prompt_text[inserted_up_to:])


def _insert_text_and_let_the_editor_catch_up(page, text_to_insert: str) -> None:
    """Insert one stretch of the prompt and wait for the editor to finish rendering it.

    Measured 2026-08-29: typing into the composer immediately after a long insertion landed inside
    the still-rendering tail and produced "elemen@Ivat".
    """
    if not text_to_insert:
        return
    page.keyboard.insert_text(text_to_insert)
    page.wait_for_timeout(INSERTED_TEXT_RENDER_MILLISECONDS)


def _append_element_chip(page, element_name: str, *, prose_stands_to_the_left: bool) -> None:
    """Turn a fresh mention into a chip at the end of the editor, guarding the prose to its left."""
    page.keyboard.press("Control+End")
    page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
    if prose_stands_to_the_left:
        page.keyboard.insert_text(" " * MENTION_DELETION_GUARD_SPACES)
        page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
    _pick_element_from_mention_menu(page, element_name)


def _pick_element_from_mention_menu(page, element_name: str) -> None:
    """Open the composer's "@" menu, type enough of the name, and click that element's row."""
    # The menu filters as the name is typed, and it only opens for real keystrokes — an inserted
    # "@" never triggers it. A few characters are enough and keep the typing short.
    page.keyboard.type(
        "@" + element_name[:ELEMENT_MENTION_TYPED_PREFIX_LENGTH],
        delay=MENTION_KEYSTROKE_DELAY_MILLISECONDS,
    )
    menu_row = _wait_for_visible_mention_row(page, element_name)
    if menu_row is None:
        sys.exit(
            f"the composer's mention menu never offered the element '{element_name}' — "
            "nothing was charged, check Assets → Elements in Dreamina"
        )
    menu_row.click()
    page.wait_for_timeout(MENTION_MENU_SETTLE_MILLISECONDS)


def _wait_for_visible_mention_row(page, element_name: str):
    """Return the menu row offering this element, or None when the menu never shows it.

    The element's own name also appears INSIDE the editor on every chip already placed, and clicking
    one of those does nothing while the typed "@Iva" stays plain text (measured 2026-08-29). Only a
    row that lives outside the editor is the menu.
    """
    for _ in range(MENTION_MENU_POLL_ATTEMPTS):
        page.wait_for_timeout(MENTION_MENU_SETTLE_MILLISECONDS)
        rows = page.get_by_text(element_name, exact=True)
        for index in range(rows.count()):
            row = rows.nth(index)
            if row.is_visible() and row.evaluate(
                f"node => !node.closest('{PROMPT_EDITOR_SELECTOR}')"
            ):
                return row
    return None


def verify_editor_holds_prompt(editor, prompt_text: str) -> None:
    """Stop before paying if the composer holds anything other than the whole prompt.

    Whitespace is ignored on both sides, because the chip changes it and nothing else. An element
    chip renders as the bare element name on its own line, so a mention followed straight by
    punctuation ("@ZhiznmartRaccoon.") reaches the editor as two words where the prompt had one
    (measured 2026-08-30), and the pad that shields the prose from the menu pick leaves spaces of
    its own. Neither touches a single character of the prompt.
    """
    editor_text = editor.inner_text() or ""
    # The "@" of a written mention is gone from the editor once the mention became a chip.
    prompt_text_as_chips = ELEMENT_MENTION_PATTERN.sub(r"\1", prompt_text)
    if _characters_without_whitespace(editor_text) == _characters_without_whitespace(
        prompt_text_as_chips
    ):
        return
    words_in_editor = editor_text.split()
    words_in_prompt = prompt_text_as_chips.split()
    sys.exit(
        f"the composer holds {len(words_in_editor)} words against the prompt's "
        f"{len(words_in_prompt)} — nothing was charged, rerun the command\n"
        f"  first difference: {_first_word_difference(words_in_editor, words_in_prompt)}"
    )


def _characters_without_whitespace(text: str) -> str:
    """Return the text as one run of characters, so line breaks and padding cannot fail the check."""
    return "".join(text.split())


def _first_word_difference(words_in_editor: list[str], words_in_prompt: list[str]) -> str:
    """Name the first word where the composer and the prompt part ways, with its neighbours."""
    for position, (in_editor, in_prompt) in enumerate(zip(words_in_editor, words_in_prompt)):
        if in_editor != in_prompt:
            context = " ".join(words_in_prompt[max(0, position - 4) : position + 4])
            return f"word {position}: composer {in_editor!r} against prompt {in_prompt!r} (…{context}…)"
    return f"one text runs longer: editor {len(words_in_editor)}, prompt {len(words_in_prompt)}"


def start_generation(page) -> None:
    """Press the round submit arrow and accept the content-rights dialog that follows it."""
    _click_submit_arrow(page)
    page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
    confirm_button = page.locator(CONTENT_RIGHTS_CONFIRM_BUTTON_SELECTOR)
    if confirm_button.count() > 0:
        confirm_button.first.click()
        page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)


# Wordings that mean the card will never become a clip. 'went wrong' is here because that is how
# Dreamina words a crashed render ("Something went wrong. Refresh and try again."); without it the
# note read as the neutral 'waiting' and the watcher polled a dead card for 23 extra minutes
# (measured 2026-08-31 on the 15s dance render, which died at 84%).
CARD_FAILURE_WORDINGS = ("failed", "Failed", "not supported", "violat", "went wrong")
# The note goes into a one-line log entry, so a long guideline paragraph is cut down to a label.
PROGRESS_NOTE_MAX_LENGTH_CHARACTERS = 120
PROGRESS_NOTE_READER_PAGE_SCRIPT_TEMPLATE = """() => {{
     const body = document.body.innerText || '';
     const progress = body.match(/\\d{{1,3}}%/);
     if (progress) return progress[0] + ' rendering';
     const failure = body.match(/[^\\n]*({failure_wordings})[^\\n]*/);
     return failure ? failure[0].slice(0, {note_max_length}) : 'waiting';
   }}"""


def read_progress_note(page) -> str:
    """Return the newest card's short status line ('42%', 'Dreaming...', a failure message)."""
    return page.evaluate(
        PROGRESS_NOTE_READER_PAGE_SCRIPT_TEMPLATE.format(
            failure_wordings="|".join(CARD_FAILURE_WORDINGS),
            note_max_length=PROGRESS_NOTE_MAX_LENGTH_CHARACTERS,
        )
    )


def download_through_browser(page, artifact_url: str, output_path: Path) -> None:
    """Save a finished artifact using the browser session that owns its CDN link."""
    response = page.request.get(artifact_url)
    if not response.ok:
        sys.exit(f"download failed: HTTP {response.status} for {artifact_url}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(response.body())


def read_credit_balance(page) -> str:
    """Read the credit badge in the sidebar, retrying while the rail is still rendering."""
    for _ in range(CREDIT_BALANCE_READ_ATTEMPTS):
        balance = _read_credit_badge_once(page)
        if balance != "unknown":
            return balance
        page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
    return "unknown"


def _settings_bar_top_of(page) -> float:
    """Return the window Y coordinate below which the composer's settings bar lives."""
    return page.evaluate("() => window.innerHeight") * SETTINGS_BAR_TOP_FRACTION_OF_WINDOW


def _clear_attached_references(page) -> None:
    """Remove every reference left in the composer by an earlier generation."""
    # An expanded panel hides the pile's tiles, so the cleanup would read an empty pile and skip.
    reference_panel.collapse_reference_panel_if_open(page)
    for _ in range(MAXIMUM_REFERENCES_TO_CLEAR):
        if count_attached_references(page) == 0:
            return
        _hover_the_reference_pile(page)
        if not page.evaluate(REMOVE_ONE_REFERENCE_SCRIPT):
            return
        page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
    sys.exit("the composer still holds references after 50 removals — clear it by hand")


def _hover_the_reference_pile(page) -> None:
    """Hover the pile so that each reference renders its remove button."""
    hover_trigger = page.locator(reference_panel.REFERENCE_PILE_HOVER_TRIGGER_SELECTOR)
    if hover_trigger.count() == 0:
        return
    hover_trigger.first.hover()
    page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)


def _click_submit_arrow(page) -> None:
    """Click the composer's submit button — the rightmost small unlabelled circle in the bar."""
    settings_bar_top = _settings_bar_top_of(page)
    submit_candidates = []
    for element in page.query_selector_all("button, [role=button], div[class*='button']"):
        box = element.bounding_box()
        if not box or box["y"] < settings_bar_top or (element.inner_text() or "").strip():
            continue
        if box["width"] <= SUBMIT_ARROW_MAX_SIDE_PX and box["height"] <= SUBMIT_ARROW_MAX_SIDE_PX:
            submit_candidates.append((box["x"], element))
    if not submit_candidates:
        sys.exit("submit arrow not found in the settings bar — the Dreamina layout changed")
    submit_candidates.sort(key=lambda candidate: candidate[0])
    submit_candidates[-1][1].click()


def _read_credit_badge_once(page) -> str:
    """Return what the sidebar badge shows right now, or 'unknown' when it is not rendered yet.

    The badge sits at the FOOT of the left rail. Height matters: the section icons higher up carry
    their own small numbers (an unread counter read as a balance of "1" on 2026-08-15).
    """
    return page.evaluate(
        """() => {
             const railWidthLimit = 120;
             const lowerHalfOfWindow = window.innerHeight / 2;
             const badges = Array.from(document.querySelectorAll('div'))
               .filter(element => /^\\d+(\\.\\d+)?K?$/.test((element.innerText || '').trim()))
               .filter(element => {
                 const box = element.getBoundingClientRect();
                 return box.left < railWidthLimit && box.top > lowerHalfOfWindow;
               });
             return badges.length ? badges[badges.length - 1].innerText.trim() : 'unknown';
           }"""
    )
