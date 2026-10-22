// Генерация картинок и видео по prompts.json: изображения — Astra (gpt-6-astra) через Codex под входом ChatGPT,
// ролики — Seedance 2.5 на сайте Dreamina через Chrome навигатора (первый кадр рисует Astra).
// node scripts/generate-media-from-prompts.mjs <prompts.json> [variants=1]
//
// prompts.json — массив, формат прежний:
// [{ "id": "hero-bg", "type": "image", "prompt": "...", "aspect_ratio": "3:2", "quality": "high", "negative": "..." },
//  { "id": "hero-video", "type": "video", "prompt": "...", "aspect_ratio": "16:9", "duration": 5 }]
// "input": { "images": [{ "type": "base64", "data": "data:image/jpeg;base64,…" }] } — снимок для правки («до/после»).
// Результат: raw/<id>-v<N>.<расширение> и raw/log.json рядом с prompts.json; промпты, ответы Codex, первые кадры
// и статусы Dreamina — в raw/generation-records/. Готовый файл при повторном запуске заново не создаётся.
// .env: MEDIA_IMAGE_GENERATOR=astra-via-codex — без него генерации нет; MEDIA_VIDEO_GENERATOR=seedance-2-5-in-dreamina —
// пусто, и видео не используется; MEDIA_GENERATION_PARALLEL — сколько позиций одновременно (по умолчанию 3).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './_env.mjs';
import { IMAGE_GENERATOR_NAME, VIDEO_GENERATOR_NAME } from './media-generation/media-generator-names.mjs';
import { validatePromptItems, variantCountOf, variantTag, imagePromptText, startFramePromptText,
  dreaminaAspectRatioFor, decodedAttachmentsOf, VIDEO_ITEM_TYPE, DEFAULT_VIDEO_DURATION_SECONDS }
  from './media-generation/prompt-item-text.mjs';
import { assertCodexSignedIn, generateImageWithAstra } from './media-generation/astra-image-via-codex.mjs';
import { RENDER_DECISION, clipRenderDecision, renderClipWithDreamina, creditsSpentForClip, paidClipNotDownloadedMessage }
  from './media-generation/seedance-video-via-dreamina.mjs';

const DEFAULT_PARALLEL_ITEMS = 3;
const DEFAULT_VARIANT_COUNT = 1;
// Упавшие изображения повторяются в этом же запуске, как раньше: до трёх кругов с растущей паузой. Ролики не
// повторяются: рендерер Dreamina сам чинит и перезапускает себя, пока кредиты не списаны.
const RETRY_ROUNDS = 3;
const DEFAULT_RETRY_PAUSE_STEP_MS = 15000;
const MS_PER_SECOND = 1000;
// Коды выхода прежние: 1 — неверный вход или генератор не готов, 4 — часть позиций не создана (его ждёт skills/media).
const EXIT_INPUT_ERROR = 1;
const EXIT_SOME_ITEMS_FAILED = 4;
const OUTPUT_FOLDER_NAME = 'raw';
const RECORDS_FOLDER_NAME = 'generation-records';
const LOG_FILE_NAME = 'log.json';
const CLIP_EXTENSION = '.mp4';
const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', CLIP_EXTENSION]);
// Изображения Astra не оплачиваются поштучно: они входят в подписку ChatGPT.
const SUBSCRIPTION_COST_LABEL = 'subscription';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const secondsSince = startedAt => Math.round((Date.now() - startedAt) / MS_PER_SECOND);
const isVideoTask = ([item]) => item.type === VIDEO_ITEM_TYPE;

/** List the [item, variant] pairs of a run: one pair per variant of every item. */
export function queueOf(items, variantCount) {
  return items.flatMap(item => Array.from({ length: variantCountOf(item, variantCount) }, (_, index) => [item, index + 1]));
}

/** Return the closing line of a run: the folder, what was not generated and what this run cost. */
export function summaryLine(outputFolder, failed, thisRunEntries) {
  const failedPart = failed.length
    ? ` НЕ СГЕНЕРИРОВАНО: ${failed.map(([item, variant]) => variantTag(item, variant)).join(', ')}.` : '';
  const imageCount = thisRunEntries.filter(entry => entry.generator === IMAGE_GENERATOR_NAME).length;
  const videos = thisRunEntries.filter(entry => entry.generator === VIDEO_GENERATOR_NAME);
  const credits = videos.reduce((sum, entry) => sum + (entry.credits ?? 0), 0);
  return `Готово. Файлы: ${outputFolder}.${failedPart} Стоимость этого запуска: изображения — в подписке ChatGPT `
    + `(${imageCount} шт.); видео — ${credits} кредитов Dreamina (${videos.length} шт.; подробности — ${LOG_FILE_NAME}).`;
}

function exitWithInputError(message) {
  console.error(message);
  process.exit(EXIT_INPUT_ERROR);
}

async function readPromptItemsOrExit(promptsFile) {
  if (!promptsFile) exitWithInputError('usage: node scripts/generate-media-from-prompts.mjs <prompts.json> [variants]');
  try {
    return validatePromptItems(JSON.parse((await fs.readFile(promptsFile, 'utf8')).replace(/^﻿/, '')));
  } catch (error) {
    exitWithInputError(`prompts.json не прочитан: ${error.message}`);
  }
}

async function assertGeneratorsReadyOrExit() {
  if (process.env.MEDIA_IMAGE_GENERATOR !== IMAGE_GENERATOR_NAME) {
    exitWithInputError(`Нужен MEDIA_IMAGE_GENERATOR=${IMAGE_GENERATOR_NAME} в .env (образец — .env.example корня плагина)`);
  }
  try { await assertCodexSignedIn(); } catch (error) { exitWithInputError(error.message); }
}

async function readEarlierLog(outputFolder) {
  try { return JSON.parse(await fs.readFile(path.join(outputFolder, LOG_FILE_NAME), 'utf8')); } catch { return []; }
}

async function newRun(promptsFile, variantCount) {
  const outputFolder = path.join(path.dirname(path.resolve(promptsFile)), OUTPUT_FOLDER_NAME);
  const recordsFolder = path.join(outputFolder, RECORDS_FOLDER_NAME);
  await fs.mkdir(recordsFolder, { recursive: true });
  return { outputFolder, recordsFolder, variantCount, log: await readEarlierLog(outputFolder), thisRunEntries: [] };
}

function retryPauseStepMs() {
  const configured = process.env.MEDIA_GENERATION_RETRY_PAUSE_MS;
  return configured === undefined || configured === '' ? DEFAULT_RETRY_PAUSE_STEP_MS : Number(configured);
}

function replaceLogEntry(run, entry) {
  run.log = run.log.filter(earlier => !(earlier.id === entry.id && earlier.variant === entry.variant));
  run.log.push(entry);
}

async function existingMediaFile(folder, stem) {
  const names = await fs.readdir(folder);
  const match = names.find(name => path.parse(name).name === stem && MEDIA_EXTENSIONS.has(path.extname(name).toLowerCase()));
  return match ? path.join(folder, match) : null;
}

async function generateImageVariant(run, item, tag) {
  const file = await generateImageWithAstra({ promptText: imagePromptText(item), attachments: decodedAttachmentsOf(item),
    recordsFolder: run.recordsFolder, tag, targetStem: path.join(run.outputFolder, tag) });
  return { generator: IMAGE_GENERATOR_NAME, cost: SUBSCRIPTION_COST_LABEL, file: path.basename(file) };
}

function assertVideoGenerationEnabled() {
  if (process.env.MEDIA_VIDEO_GENERATOR !== VIDEO_GENERATOR_NAME) {
    throw new Error(`видео отключено: в .env нет MEDIA_VIDEO_GENERATOR=${VIDEO_GENERATOR_NAME}`);
  }
}

async function startFrameFor(run, item, tag, aspectRatio) {
  const frameTag = `${tag}-start-frame`;
  const existing = await existingMediaFile(run.recordsFolder, frameTag);
  if (existing) return existing;
  return generateImageWithAstra({ promptText: startFramePromptText(item, aspectRatio), attachments: decodedAttachmentsOf(item),
    recordsFolder: run.recordsFolder, tag: frameTag, targetStem: path.join(run.recordsFolder, frameTag) });
}

async function generateVideoVariant(run, item, tag) {
  assertVideoGenerationEnabled();
  const shape = dreaminaAspectRatioFor(item.aspect_ratio);
  if (shape.replaced) console.log(`  ${tag}: Dreamina рендерит только 16:9 и 9:16 — ${item.aspect_ratio} заменён на ${shape.label}`);
  const clipPath = path.join(run.recordsFolder, `${tag}-dreamina${CLIP_EXTENSION}`);
  const decision = await clipRenderDecision(clipPath);
  if (decision === RENDER_DECISION.refuse) throw new Error(paidClipNotDownloadedMessage(clipPath));
  if (decision === RENDER_DECISION.render) {
    const startFrame = await startFrameFor(run, item, tag, shape.label);
    const durationSeconds = Number(item.duration) || DEFAULT_VIDEO_DURATION_SECONDS;
    await renderClipWithDreamina({ motionPrompt: item.prompt, startFrame, aspectRatio: shape.label, durationSeconds, clipPath });
  }
  await fs.copyFile(clipPath, path.join(run.outputFolder, `${tag}${CLIP_EXTENSION}`));
  const requested = shape.replaced ? { aspect_ratio_requested: item.aspect_ratio } : {};
  return { generator: VIDEO_GENERATOR_NAME, credits: await creditsSpentForClip(clipPath), aspect_ratio: shape.label,
    ...requested, file: `${tag}${CLIP_EXTENSION}` };
}

async function generateVariant(run, item, variant) {
  const tag = variantTag(item, variant);
  const startedAt = Date.now();
  try {
    const existing = await existingMediaFile(run.outputFolder, tag);
    if (existing) { console.log(`= ${tag} — уже есть (${path.basename(existing)}), заново не создаю`); return true; }
    console.log(`… ${tag}`);
    const generate = item.type === VIDEO_ITEM_TYPE ? generateVideoVariant : generateImageVariant;
    const result = await generate(run, item, tag);
    const entry = { id: item.id, variant, seconds: secondsSince(startedAt), ...result };
    replaceLogEntry(run, entry);
    run.thisRunEntries.push(entry);
    console.log(`✓ ${tag} — ${entry.seconds} с${entry.credits != null ? `, ${entry.credits} кредитов Dreamina` : ''}`);
    return true;
  } catch (error) {
    console.error(`✗ ${tag}: ${error.message}`);
    replaceLogEntry(run, { id: item.id, variant, error: error.message });
    return false;
  }
}

async function runQueue(run, queue) {
  const failed = [];
  const parallel = Math.max(1, Number(process.env.MEDIA_GENERATION_PARALLEL) || DEFAULT_PARALLEL_ITEMS);
  const worker = async () => {
    for (let task = queue.shift(); task; task = queue.shift()) if (!(await generateVariant(run, ...task))) failed.push(task);
  };
  await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, worker));
  return failed;
}

async function retryFailedImages(run, failed) {
  let failedImages = failed.filter(task => !isVideoTask(task));
  for (let round = 1; round <= RETRY_ROUNDS && failedImages.length; round++) {
    const pauseMs = retryPauseStepMs() * round;
    console.log(`Повтор упавших изображений (${failedImages.length}), круг ${round}/${RETRY_ROUNDS}, пауза ${pauseMs / MS_PER_SECOND} с`);
    await sleep(pauseMs);
    failedImages = await runQueue(run, [...failedImages]);
  }
  return [...failed.filter(isVideoTask), ...failedImages];
}

async function main() {
  const [promptsFile, variantArgument] = process.argv.slice(2);
  const items = await readPromptItemsOrExit(promptsFile);
  await assertGeneratorsReadyOrExit();
  const run = await newRun(promptsFile, Number(variantArgument) || DEFAULT_VARIANT_COUNT);
  const failed = await retryFailedImages(run, await runQueue(run, queueOf(items, run.variantCount)));
  await fs.writeFile(path.join(run.outputFolder, LOG_FILE_NAME), JSON.stringify(run.log, null, 2), 'utf8');
  console.log(summaryLine(run.outputFolder, failed, run.thisRunEntries));
  if (failed.length) process.exit(EXIT_SOME_ITEMS_FAILED);
}

// Запуск командой; импорт в тестах только берёт функции.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadEnv();
  await main();
}
