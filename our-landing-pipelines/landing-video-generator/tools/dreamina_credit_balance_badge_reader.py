#!/usr/bin/env python3
"""Read the Dreamina credit balance from the badge at the top right of the page.

Why this module exists. The copied `dreamina_web_ui_composer_browser_mechanics` reads the balance from
a bare number at the foot of the LEFT RAIL. Dreamina has since moved the badge to the top right of the
page, next to the plan name ("18.9K", then "Standard" and an offer line; inspection 2026-09-28), so the
copied reader returns "unknown" and the credit preflight stops every real run before submit. The copy
stays byte-identical to its source in video-generation, so the adapted reader lives here and the
landing driver calls it instead of `composer.read_credit_balance`.

How the badge is found. The amount sits in an element whose class starts with `credit-amount-text-`
(the hashed suffix changes between releases, the prefix names the role). Its parent container
`credit-action-` also holds the notification counter ("2"), which is why the reader never takes the
first number of that container: an unread counter was once read as a balance of "1" (2026-08-15).
Only a badge inside the top bar counts.

What it returns. Only the leading number of the badge text ("18.9K" from "18.9K Standard"), in the form
`CREDIT_BADGE_PATTERN` of the preflight parses. Anything else — no badge, an empty badge, a number in an
unknown format — returns "unknown" after the retries, and the preflight then stops the run before
anything is charged.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from dreamina_web_ui_composer_browser_mechanics import (  # noqa: E402
    CREDIT_BALANCE_READ_ATTEMPTS,
    SHORT_INTERACTION_PAUSE_MILLISECONDS,
)

# Same value the copied composer returns for an unread badge; the preflight treats it as no balance.
UNREADABLE_BADGE_TEXT = "unknown"
CREDIT_AMOUNT_SELECTOR = "[class*='credit-amount-text-']"
# The top bar ends about 56 px down (badge box top 28, height 20 on 2026-09-28); the composer and the
# feed start far below, so a credit amount lower than this is not the account balance.
TOP_BAR_BOTTOM_LIMIT_PX = 120
# Leading "18.9K" or "1234", followed by whitespace or the end; "1,234" or "1.2M" do not match and
# read as unknown, which stops the run instead of guessing.
LEADING_BALANCE_NUMBER_PATTERN = re.compile(r"^\s*(\d+(?:\.\d+)?K?)(?=\s|$)")
TOP_BAR_CREDIT_AMOUNT_SCRIPT = """(selectorAndLimit) => {
  const [selector, topBarBottomLimit] = selectorAndLimit;
  const amounts = Array.from(document.querySelectorAll(selector)).filter(element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.top < topBarBottomLimit;
  });
  return amounts.length ? (amounts[0].innerText || '') : '';
}"""


def read_credit_balance(page) -> str:
    """Read the top-right credit badge, retrying while the top bar is still rendering; 'unknown' if never."""
    for _ in range(CREDIT_BALANCE_READ_ATTEMPTS):
        balance_number = balance_number_from_badge_text(_read_badge_text_once(page))
        if balance_number != UNREADABLE_BADGE_TEXT:
            return balance_number
        page.wait_for_timeout(SHORT_INTERACTION_PAUSE_MILLISECONDS)
    return UNREADABLE_BADGE_TEXT


def balance_number_from_badge_text(badge_text: str) -> str:
    """The leading balance number of a badge text ("18.9K" from "18.9K Standard"), or 'unknown'."""
    leading_number = LEADING_BALANCE_NUMBER_PATTERN.match(badge_text or "")
    if leading_number is None:
        return UNREADABLE_BADGE_TEXT
    return leading_number.group(1)


def _read_badge_text_once(page) -> str:
    """Return the text of the credit amount in the top bar right now, or '' when it is not drawn."""
    return page.evaluate(TOP_BAR_CREDIT_AMOUNT_SCRIPT, [CREDIT_AMOUNT_SELECTOR, TOP_BAR_BOTTOM_LIMIT_PX])
