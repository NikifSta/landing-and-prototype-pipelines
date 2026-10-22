// Запуск внешней программы (Codex, рендерер Dreamina) с текстом на вход; ненулевой код не бросает исключение.
import { spawn } from 'node:child_process';

// Сколько последних символов вывода программы попадает в текст ошибки: хватает на причину, не засоряет журнал.
const ERROR_TAIL_CHARACTERS = 600;

/** Return the last characters of a program's output for an error message. */
export function tailOf(text) {
  return String(text ?? '').trim().slice(-ERROR_TAIL_CHARACTERS);
}

/** Run a program with optional stdin text; resolve with its exit status, stdout and stderr; echo mirrors output live. */
export function runCommand(command, args, stdinText = '', { echo = false, ...spawnOptions } = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], ...spawnOptions });
    const output = { stdout: '', stderr: '' };
    child.stdout.on('data', chunk => { output.stdout += chunk; if (echo) process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { output.stderr += chunk; if (echo) process.stderr.write(chunk); });
    // Программа может закрыть вход, не дочитав его: это не ошибка запуска.
    child.stdin.on('error', () => {});
    child.on('error', error => resolve({ status: null, ...output, stderr: `${output.stderr}${error.message}` }));
    child.on('close', status => resolve({ status, ...output }));
    child.stdin.end(stdinText);
  });
}
