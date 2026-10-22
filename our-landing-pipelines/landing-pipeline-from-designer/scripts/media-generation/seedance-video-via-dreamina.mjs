// Один ролик Seedance 2.5 в Dreamina через Chrome навигатора — рендерер проекта
// dev/pipelines/landing-video-generator/tools/landing_scroll_clip_dreamina_renderer.py. Первый кадр рисует Astra.
// Ролик, за который Dreamina уже могла списать кредиты, повторно не рендерится.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, tailOf } from './command-runner.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Плагин лежит в dev/pipelines/<папка>/ проекта: корень проекта — тремя уровнями выше.
const REPOSITORY_ROOT = path.resolve(PLUGIN_ROOT, '../../..');
const DEFAULT_PYTHON = path.join(REPOSITORY_ROOT, '.venv/bin/python');
const DEFAULT_DREAMINA_RENDERER = path.join(REPOSITORY_ROOT,
  'dev/pipelines/landing-video-generator/tools/landing_scroll_clip_dreamina_renderer.py');
// Статус рендерера лежит рядом с роликом: <имя ролика без .mp4>-dreamina-status.json (status_path_for рендерера).
const CLIP_EXTENSION_PATTERN = /\.mp4$/;
const STATUS_FILE_SUFFIX = '-dreamina-status.json';
const MOTION_PROMPT_FILE_SUFFIX = '-motion-prompt.txt';
// Состояния статуса: rendering — до кнопки запуска (кредиты не списаны), downloaded — ролик скачан.
const RENDERING_STATE = 'rendering';
const DOWNLOADED_STATE = 'downloaded';

/** What to do with a clip given its earlier status: render it, reuse the downloaded file or refuse a paid lost one. */
export const RENDER_DECISION = Object.freeze({ render: 'render', reuse: 'reuse', refuse: 'refuse' });

// Тесты подменяют python и рендерер поддельными программами.
const pythonCommand = () => process.env.MEDIA_GENERATION_PYTHON || DEFAULT_PYTHON;
const rendererScript = () => process.env.MEDIA_GENERATION_DREAMINA_RENDERER || DEFAULT_DREAMINA_RENDERER;
const statusPathOf = clipPath => clipPath.replace(CLIP_EXTENSION_PATTERN, '') + STATUS_FILE_SUFFIX;

/** Decide from an earlier status whether a clip may be rendered. */
export function earlierRenderDecision(status, clipExists) {
  if (!status || status.state === RENDERING_STATE) return RENDER_DECISION.render;
  if (status.state === DOWNLOADED_STATE && clipExists) return RENDER_DECISION.reuse;
  return RENDER_DECISION.refuse;
}

// Dreamina показывает баланс числом или с округлением до сотен и суффиксом тысяч: «15047», «16.6K».
const CREDIT_BALANCE_PATTERN = /^(\d+(?:\.\d+)?)\s*([Kk])?$/;
const CREDITS_PER_THOUSAND_SUFFIX = 1000;

function creditBalanceOf(value) {
  const match = CREDIT_BALANCE_PATTERN.exec(String(value ?? '').trim());
  if (!match) return null;
  return Number(match[1]) * (match[2] ? CREDITS_PER_THOUSAND_SUFFIX : 1);
}

/** Return the credits a render spent by its status, or null when a balance was not read or not understood. */
export function creditsSpentOf(status) {
  const before = creditBalanceOf(status?.credit_balance_before);
  const after = creditBalanceOf(status?.credit_balance_after);
  if (before === null || after === null) return null;
  // Округление убирает хвост двоичной дроби: 16.6K − 16.3K даёт ровно 300.
  return Math.round(before - after);
}

async function readRenderStatus(clipPath) {
  try { return JSON.parse(await fs.readFile(statusPathOf(clipPath), 'utf8')); } catch { return null; }
}

/** Return the render decision of a clip from the status file next to it. */
export async function clipRenderDecision(clipPath) {
  const clipExists = await fs.access(clipPath).then(() => true, () => false);
  return earlierRenderDecision(await readRenderStatus(clipPath), clipExists);
}

/** Return the credits the clip's render spent, or null. */
export async function creditsSpentForClip(clipPath) {
  return creditsSpentOf(await readRenderStatus(clipPath));
}

/** Return the message for a clip Dreamina may have charged for but that never arrived. */
export function paidClipNotDownloadedMessage(clipPath) {
  return `ролик ${path.basename(clipPath)} уже оплачен в Dreamina, но не скачан: повторный рендер не запускаю `
    + `(статус — ${statusPathOf(clipPath)}); заберите ролик на сайте Dreamina`;
}

/** Return the renderer arguments of one clip. */
export function dreaminaRendererArguments({ startFrame, promptFile, aspectRatio, durationSeconds, outputClip }) {
  return [rendererScript(), '--start-frame', startFrame, '--prompt-file', promptFile, '--aspect-ratio', aspectRatio,
    '--duration-seconds', String(durationSeconds), '--output-clip', outputClip];
}

/** Render one clip in Dreamina from a start frame; throw the renderer's reason when it fails. */
export async function renderClipWithDreamina({ motionPrompt, startFrame, aspectRatio, durationSeconds, clipPath }) {
  const promptFile = clipPath.replace(CLIP_EXTENSION_PATTERN, MOTION_PROMPT_FILE_SUFFIX);
  await fs.writeFile(promptFile, motionPrompt, 'utf8');
  const args = dreaminaRendererArguments({ startFrame, promptFile, aspectRatio, durationSeconds, outputClip: clipPath });
  // Рендер идёт минуты: вывод рендерера сразу виден в журнале запуска.
  const result = await runCommand(pythonCommand(), args, '', { echo: true });
  if (result.status !== 0) {
    throw new Error(`рендерер Dreamina завершился с кодом ${result.status}: ${tailOf(result.stderr || result.stdout)}`);
  }
}
