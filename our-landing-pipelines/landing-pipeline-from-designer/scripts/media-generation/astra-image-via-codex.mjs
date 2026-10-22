// Одно изображение через Astra (gpt-6-astra) в Codex под входом ChatGPT — та же команда и те же ограничения,
// что у генератора изображений проекта (dev/pipelines/landing-image-generator/generate-landing-image.md, раздел 5).
import fs from 'node:fs/promises';
import path from 'node:path';
import { runCommand, tailOf } from './command-runner.mjs';

const ASTRA_MODEL = 'gpt-6-astra';
const DEFAULT_CODEX_COMMAND = 'codex';
const CODEX_INSTRUCTION = 'Создай одно изображение встроенным генератором изображений строго по промпту ниже. '
  + 'Вложения — исходные материалы, их роли указаны в промпте. Ответь только абсолютным путём созданного файла.';
const SIGNED_IN_MARKER = 'Logged in';
const DEFAULT_IMAGE_EXTENSION = '.png';

// Тесты подменяют Codex поддельной программой; в работе — codex из PATH.
const codexCommand = () => process.env.MEDIA_GENERATION_CODEX_COMMAND || DEFAULT_CODEX_COMMAND;

/** Return the codex exec arguments of one image: read-only, no shell, no web, every attachment as --image. */
export function codexImageArguments({ workingFolder, answerFile, attachmentPaths }) {
  return ['exec', '--ignore-user-config', '--skip-git-repo-check', '-m', ASTRA_MODEL, '-C', workingFolder,
    '--sandbox', 'read-only', '-c', 'approval_policy="never"', '-c', 'web_search="disabled"',
    '-c', 'features.code_mode_host=true', '-c', 'tools.view_image=true', '--enable', 'image_generation',
    '--disable', 'shell_tool', '--disable', 'unified_exec', '--disable', 'apps', '--disable', 'plugins',
    ...attachmentPaths.flatMap(attachmentPath => ['--image', attachmentPath]), '-o', answerFile, '-'];
}

/** Throw the reason when Codex is not signed in to ChatGPT: without it Astra cannot draw. */
export async function assertCodexSignedIn() {
  const result = await runCommand(codexCommand(), ['login', 'status']);
  const output = `${result.stdout}${result.stderr}`.trim();
  if (result.status !== 0 || !output.includes(SIGNED_IN_MARKER)) {
    throw new Error(`Codex не вошёл в ChatGPT (codex login status: ${output || 'нет ответа'}); выполните codex login`);
  }
}

function attachmentPathFor(recordsFolder, tag, index, extension) {
  return path.join(recordsFolder, `${tag}-attachment-${index + 1}.${extension}`);
}

async function createdImagePath(answerFile) {
  const answer = (await fs.readFile(answerFile, 'utf8').catch(() => '')).trim();
  const candidate = answer.split(/\r?\n/).pop()?.trim() ?? '';
  const exists = candidate !== '' && await fs.access(candidate).then(() => true, () => false);
  if (!exists) throw new Error(`Astra не вернула путь к созданному файлу; ответ Codex: ${tailOf(answer) || 'пусто'}`);
  return candidate;
}

/** Draw one image with Astra, copy it to targetStem plus its extension and return the copy's path. */
export async function generateImageWithAstra({ promptText, attachments, recordsFolder, tag, targetStem }) {
  await fs.mkdir(recordsFolder, { recursive: true });
  const answerFile = path.join(recordsFolder, `${tag}-codex-answer.txt`);
  await fs.writeFile(path.join(recordsFolder, `${tag}-prompt.md`), promptText, 'utf8');
  const attachmentPaths = attachments.map((attachment, index) => attachmentPathFor(recordsFolder, tag, index, attachment.extension));
  await Promise.all(attachments.map((attachment, index) => fs.writeFile(attachmentPaths[index], attachment.bytes)));
  const args = codexImageArguments({ workingFolder: recordsFolder, answerFile, attachmentPaths });
  const result = await runCommand(codexCommand(), args, `${CODEX_INSTRUCTION}\n\n${promptText}`);
  if (result.status !== 0) throw new Error(`Codex завершился с кодом ${result.status}: ${tailOf(result.stderr)}`);
  const createdPath = await createdImagePath(answerFile);
  const targetPath = `${targetStem}${path.extname(createdPath).toLowerCase() || DEFAULT_IMAGE_EXTENSION}`;
  await fs.copyFile(createdPath, targetPath);
  return targetPath;
}
