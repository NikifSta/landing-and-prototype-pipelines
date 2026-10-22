#!/usr/bin/env python3
"""Stop a render that needs a Dreamina plan the account does not have, before the charge or right after the submit.

Why this module exists. Inspection 19-10-2026, after a start-frame render waited out the clip watcher's
whole 40-minute timeout: the account's plan had lapsed. The top-right badge that read "18.9K Standard" on
2026-09-28 read "15K Upgrade", its container carried a `non-vip-` class, and the composer marked the chosen
Seedance 2.5 with a plan icon (`vip-icon-`; every Seedance 2.x and every resolution tier carried it, only
Seedance 1.x did not). The submit opened the "All plans" drawer instead of starting the render: the prompt
stayed in the field, no generative session appeared, and nothing ever reached the feed. The watcher saw only
the home page's template previews.

Two checks, both read-only. Before the submit: an account without a plan and a model marked as a plan
feature stop the run before anything is charged; the driver runs it ahead of --stop-before-submit, so the
free check run meets it too. While waiting: the plans drawer on the page stops the wait at once instead of
after the timeout, for the cases the first check cannot see (a plan that lacks one feature, a renamed badge).
"""

from __future__ import annotations

import sys

# Start of both stop messages; the repair loop counts it as a business stop: a lapsed plan is not a script bug.
PAID_PLAN_REQUIRED_MESSAGE_START = "Dreamina needs a paid plan"
# The badge container's class reads "credit-display-container-AxjfMw row-mode-OFlmHI non-vip-u3A8" on the free
# plan (19-10-2026); the hashed suffixes change between releases, the prefixes name the role.
ACCOUNT_WITHOUT_PLAN_BADGE_SELECTOR = "[class*='credit-display-container-'][class*='non-vip-']:visible"
# The settings-bar dropdown that shows the chosen model holds the plan icon next to its name (19-10-2026).
PLAN_MARKED_SETTINGS_CONTROL_SELECTOR = ".lv-select-view-value:has([class*='vip-icon-']):visible"
# The drawer the submit opened: "lv-drawer index_module_CommerceDrawer_drawer3 …" (19-10-2026).
PLANS_DRAWER_SELECTOR = "[class*='CommerceDrawer_drawer']:visible"


def stop_if_account_lacks_the_plan_the_model_needs(page) -> None:
    """Stop before the charge when the account shows no plan and the chosen model is marked as a plan feature."""
    if page.locator(ACCOUNT_WITHOUT_PLAN_BADGE_SELECTOR).count() == 0:
        return
    plan_marked_controls = page.locator(PLAN_MARKED_SETTINGS_CONTROL_SELECTOR)
    if plan_marked_controls.count() == 0:
        return
    sys.exit(
        f"{PAID_PLAN_REQUIRED_MESSAGE_START} for {plan_marked_controls.first.inner_text().strip()}: the account "
        "badge shows no plan ('Upgrade') and the composer marks the model as a plan feature — nothing was "
        "charged. Renew the Dreamina subscription and rerun."
    )


def stop_if_plans_drawer_opened(page) -> None:
    """Stop the wait when the submit opened the plans drawer: the render never started and never will."""
    if page.locator(PLANS_DRAWER_SELECTOR).count() == 0:
        return
    sys.exit(
        f"{PAID_PLAN_REQUIRED_MESSAGE_START}: the submit opened the 'All plans' drawer instead of starting the "
        "render — the render did not start; read the balance badge to confirm nothing was charged. Renew the "
        "Dreamina subscription and rerun."
    )
