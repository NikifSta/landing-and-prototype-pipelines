// Общая загрузка .env для скриптов плагина: сначала .env рабочей папки пользователя, затем .env в корне плагина.
// Уже заданные переменные окружения не перезаписываются. Нужен, чтобы скрипты работали, когда рабочая папка — не корень плагина.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  // env.txt — то же самое, что .env: в Windows файл без имени с точкой в начале неудобно создавать и сохранять
  for (const p of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'env.txt'), path.join(ROOT, '.env'), path.join(ROOT, 'env.txt')]) {
    try {
      for (const line of fs.readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
      }
    } catch { /* файла нет — это нормально */ }
  }
}
