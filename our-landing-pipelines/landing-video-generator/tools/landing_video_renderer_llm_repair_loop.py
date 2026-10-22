#!/usr/bin/env python3
"""Hand a failed landing clip render to an LLM that repairs the script, and decide whether a rerun is free.

The renderer drives Dreamina's web page, which changes without notice: on 29-09-2026 a start-frame render
died because the prompt field had become a plain textarea, and the video pipeline's agent only returned
the error. Now the renderer calls a repair agent (`claude -p`, standing instructions in
landing-video-renderer-repair-agent-prompt.md): it inspects the live page read-only, fixes the script,
verifies the fix with a free check run (--stop-before-submit) and commits. The renderer reruns itself only
when the failed run never reached the submit, so a clip is never paid for twice.
"""

from __future__ import annotations

import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from dreamina_paid_plan_requirement_checker import PAID_PLAN_REQUIRED_MESSAGE_START

PIPELINE_DIR = Path(__file__).resolve().parent.parent
# landing-video-generator -> pipelines -> dev -> repository root.
REPOSITORY_ROOT = PIPELINE_DIR.parents[2]
REPAIR_AGENT_PROMPT_PATH = PIPELINE_DIR / "landing-video-renderer-repair-agent-prompt.md"
# One repair for the first break and one for a second break the repaired run may meet further on
# (spec 2026-09-29-landing-video-renderer-llm-self-repair-design.md, section 5).
DEFAULT_REPAIR_ATTEMPTS_PER_RUN = 2
REPAIR_ATTEMPTS_LEFT_OPTION = "--repair-attempts-left"
STOP_BEFORE_SUBMIT_OPTION = "--stop-before-submit"
# Code executors of this project run on Opus 5.5 (CLAUDE.md, "Исполнители прототипирования приложений").
REPAIR_AGENT_MODEL = "claude-opus-5-5"
REPAIR_AGENT_EFFORT = "xhigh"
# The manual repair of 29-09-2026 (page inspection, fix, tests, one free check run) took under half an
# hour; this bound only catches an agent that hangs.
REPAIR_AGENT_TIMEOUT_SECONDS = 45 * 60
# The budget lives only in ~/.claude/cli-budgets.env (global rule); the call follows the global template.
REPAIR_AGENT_SHELL_COMMAND = (
    'source "$HOME/.claude/cli-budgets.env" 2>/dev/null || true; '
    'exec env -u CLAUDECODE claude -p --output-format text --model "$1" --effort "$2" '
    '--dangerously-skip-permissions --max-budget-usd "${BUDGET_NORMAL:-5}"'
)
# Name of the inline shell script, shown in process lists and in bash's own error messages.
REPAIR_AGENT_SHELL_NAME = "landing-video-renderer-repair-agent"
FIXED_VERDICT = "FIXED"
# Markdown the agent may wrap its verdict in, such as "**FIXED**".
VERDICT_DECORATION_CHARACTERS = "*`_ "
# The summary goes into a stop message the calling agent relays; the full answer stays in the log.
SUMMARY_MAX_CHARACTERS = 600
AGENT_ERROR_TAIL_CHARACTERS = 300
REPAIR_LOG_NAME_TEMPLATE = "{clip_stem}-repair-attempt-{attempt_number}-log.txt"
RENDER_SUBMITTED_NOTE = "да — кнопка запуска была нажата, кредиты могли списаться; рендер не повторяй"
RENDER_NOT_SUBMITTED_NOTE = "нет — ничего не списано"
# Stops that are not script bugs end the run as before, without an LLM; matched by how the message starts.
BUSINESS_STOP_MESSAGE_STARTS = (
    "no live Chrome session",
    "not enough Dreamina credits",
    "no measured Dreamina price",
    "Dreamina refused this request",
    "Dreamina dropped this render",
    "the prompt mentions",
    "the composer's mention menu never offered",
    PAID_PLAN_REQUIRED_MESSAGE_START,
)


@dataclass
class RepairRequest:
    """What the repair agent is told about one failure."""

    failure_text: str
    free_check_command: str
    render_was_submitted: bool
    attempt_number: int
    log_path: Path


@dataclass
class RepairVerdict:
    """The agent's answer: fixed or not, a short summary, and where its full output lies."""

    fixed: bool
    summary: str
    log_path: Path


def is_business_stop(failure_message: str) -> bool:
    """True for a stop that is not a script bug (no session, no credits, Dreamina refused): no repair."""
    return failure_message.startswith(BUSINESS_STOP_MESSAGE_STARTS)


def failure_message_of(failure: BaseException) -> str:
    """The one-line reason: the text of a sys.exit stop, or the exception type and text."""
    if isinstance(failure, SystemExit):
        return str(failure.code)
    return f"{type(failure).__name__}: {failure}"


def repair_log_path_for(output_clip: Path, attempt_number: int) -> Path:
    """The repair agent's full output lies next to the clip it was repairing."""
    return output_clip.with_name(
        REPAIR_LOG_NAME_TEMPLATE.format(clip_stem=output_clip.stem, attempt_number=attempt_number))


def arguments_for_rerun(argv: list[str], repair_attempts_left: int) -> list[str]:
    """The same command-line arguments with the repair counter set to the given number."""
    rerun_arguments = list(argv)
    if REPAIR_ATTEMPTS_LEFT_OPTION in rerun_arguments:
        option_index = rerun_arguments.index(REPAIR_ATTEMPTS_LEFT_OPTION)
        del rerun_arguments[option_index:option_index + 2]
    return rerun_arguments + [REPAIR_ATTEMPTS_LEFT_OPTION, str(repair_attempts_left)]


def free_check_command(renderer_path: Path, argv: list[str], working_dir: Path) -> str:
    """The shell command that repeats this run as a free check: stopped before the submit, no nested repair."""
    check_arguments = arguments_for_rerun(argv, 0)
    if STOP_BEFORE_SUBMIT_OPTION not in check_arguments:
        check_arguments.append(STOP_BEFORE_SUBMIT_OPTION)
    renderer_command = shlex.join([sys.executable, str(renderer_path), *check_arguments])
    return f"cd {shlex.quote(str(working_dir))} && {renderer_command}"


def build_repair_agent_prompt(request: RepairRequest) -> str:
    """The standing instructions from the prompt file followed by the facts of this failure."""
    submitted_note = RENDER_SUBMITTED_NOTE if request.render_was_submitted else RENDER_NOT_SUBMITTED_NOTE
    return (
        REPAIR_AGENT_PROMPT_PATH.read_text(encoding="utf-8")
        + "\n\n## Этот сбой\n\n"
        + f"- Попытка починки: {request.attempt_number} из {DEFAULT_REPAIR_ATTEMPTS_PER_RUN}.\n"
        + f"- Рендер уже отправлен: {submitted_note}.\n"
        + f"- Проверка без оплаты: `{request.free_check_command}`\n\n"
        + f"Ошибка:\n\n```\n{request.failure_text}\n```\n"
    )


def _run_repair_agent(prompt: str) -> tuple[str, str]:
    """Run `claude -p` with the prompt on stdin in the project root; return its answer and its error output."""
    try:
        completed = subprocess.run(
            ["bash", "-c", REPAIR_AGENT_SHELL_COMMAND, REPAIR_AGENT_SHELL_NAME, REPAIR_AGENT_MODEL, REPAIR_AGENT_EFFORT],
            input=prompt, capture_output=True, text=True, timeout=REPAIR_AGENT_TIMEOUT_SECONDS, cwd=REPOSITORY_ROOT)
    except subprocess.TimeoutExpired:
        return "", f"the repair agent did not answer within {REPAIR_AGENT_TIMEOUT_SECONDS}s"
    return completed.stdout, completed.stderr


def parse_repair_verdict(agent_answer: str, log_path: Path) -> RepairVerdict:
    """FIXED only when the answer's first line says exactly that; anything else counts as not fixed."""
    lines = [line.strip() for line in agent_answer.splitlines() if line.strip()]
    if not lines:
        return RepairVerdict(fixed=False, summary="the repair agent gave no answer", log_path=log_path)
    fixed = lines[0].strip(VERDICT_DECORATION_CHARACTERS) == FIXED_VERDICT
    summary = " ".join(lines[1:]) or lines[0]
    return RepairVerdict(fixed=fixed, summary=summary[:SUMMARY_MAX_CHARACTERS], log_path=log_path)


def ask_repair_agent(request: RepairRequest) -> RepairVerdict:
    """Run the repair agent once, keep its full output next to the clip and read its verdict."""
    print(f"script failure — asking the repair agent (attempt {request.attempt_number}); "
          f"log: {request.log_path}", flush=True)
    agent_answer, agent_errors = _run_repair_agent(build_repair_agent_prompt(request))
    request.log_path.parent.mkdir(parents=True, exist_ok=True)
    request.log_path.write_text(f"{agent_answer}\n--- stderr ---\n{agent_errors}", encoding="utf-8")
    return parse_repair_verdict(agent_answer or agent_errors[-AGENT_ERROR_TAIL_CHARACTERS:], request.log_path)


def stop_unless_rerun_is_free(verdict: RepairVerdict, render_was_submitted: bool, failure_message: str) -> None:
    """Stop when the agent could not fix the script, or fixed it after the render was already submitted."""
    if not verdict.fixed:
        sys.exit(f"{failure_message}\n— the repair agent could not fix it: {verdict.summary}\n"
                 f"  log: {verdict.log_path}")
    if render_was_submitted:
        sys.exit(f"the repair agent fixed the script: {verdict.summary}\n"
                 "The render had already been submitted, so it is not repeated automatically — the credits "
                 "may be spent. Check the Dreamina feed and the balance before ordering it again.\n"
                 f"  log: {verdict.log_path}")
    print(f"the repair agent fixed the script: {verdict.summary} — rerunning the render", flush=True)
