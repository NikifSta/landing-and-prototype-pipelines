// Статический сервер для просмотра черновиков и сайта на этом компьютере: node scripts/serve.mjs [порт=5180]
// Корень — рабочая папка, например http://localhost:5180/projects/<slug>/06-drafts/a.html
// Слушает только 127.0.0.1: с телефона и других устройств страница смотрится по ссылке страницы запуска (skills/publish).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 5180;
// Только этот компьютер: сервер отдаёт файлы рабочей папки, из сети их видно быть не должно.
const LISTEN_HOST = '127.0.0.1';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const DIRECTORY_INDEX_FILE = 'index.html';
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
// Файлы с ключами и скрытые файлы (.env, .git, …) не отдаются никогда, даже внутри корня.
const KEY_FILE_NAMES = new Set(['.env', 'env.txt']);
const HIDDEN_NAME_PREFIX = '.';

function decodedRequestPath(requestUrl) {
  try { return decodeURIComponent(String(requestUrl).split('?')[0]); } catch { return null; }
}

function isInsideRoot(rootFolder, filePath) {
  return filePath === rootFolder || filePath.startsWith(rootFolder + path.sep);
}

function hasKeyOrHiddenSegment(rootFolder, filePath) {
  const segments = path.relative(rootFolder, filePath).split(path.sep);
  return segments.some(segment => KEY_FILE_NAMES.has(segment) || segment.startsWith(HIDDEN_NAME_PREFIX));
}

/** Return the file a request asks for inside the root, or why it must not be served (forbidden or malformed). */
export function requestedFilePath(rootFolder, requestUrl) {
  const decodedPath = decodedRequestPath(requestUrl);
  if (decodedPath === null) return { kind: 'malformed' };
  const root = path.resolve(rootFolder);
  const filePath = path.join(root, decodedPath);
  if (!isInsideRoot(root, filePath) || hasKeyOrHiddenSegment(root, filePath)) return { kind: 'forbidden' };
  return { kind: 'file', filePath };
}

async function respondWithFile(response, filePath) {
  try {
    const file = (await fs.stat(filePath)).isDirectory() ? path.join(filePath, DIRECTORY_INDEX_FILE) : filePath;
    const body = await fs.readFile(file);
    const contentType = CONTENT_TYPES[path.extname(file).toLowerCase()] || DEFAULT_CONTENT_TYPE;
    response.writeHead(HTTP_OK, { 'Content-Type': contentType, 'Cache-Control': 'no-store' }).end(body);
  } catch {
    response.writeHead(HTTP_NOT_FOUND).end('not found');
  }
}

/** Create the static file server of a root folder; it serves only what requestedFilePath allows. */
export function createStaticFileServer(rootFolder) {
  return http.createServer(async (request, response) => {
    const target = requestedFilePath(rootFolder, request.url);
    if (target.kind === 'malformed') { response.writeHead(HTTP_BAD_REQUEST).end('bad request'); return; }
    // Запрещённый файл отвечает как отсутствующий: сервер не подтверждает, что он есть.
    if (target.kind === 'forbidden') { response.writeHead(HTTP_NOT_FOUND).end('not found'); return; }
    await respondWithFile(response, target.filePath);
  });
}

function main() {
  const port = Number(process.argv[2]) || DEFAULT_PORT;
  createStaticFileServer(process.cwd()).listen(port, LISTEN_HOST, () => console.log(`http://localhost:${port}/`));
}

// Запуск командой; импорт в тестах только берёт функции.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
