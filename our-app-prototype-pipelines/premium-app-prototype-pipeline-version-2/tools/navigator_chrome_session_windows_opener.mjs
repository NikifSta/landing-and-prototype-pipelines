// Opens one Chrome window per stage 02 researcher in the navigator Chrome, tiled as a
// non-overlapping 2x2 mosaic of full HD cells on the 3840x2160 navigator screen, and closes
// them after the round. Under Xvfb Chrome renders only windows that other windows do not cover,
// so each researcher needs its own uncovered window (probes 2026-10-17). Raw CDP over the
// built-in WebSocket of Node 22: the tool attaches to no page and never closes Chrome.
//
// Usage:
//   node navigator_chrome_session_windows_opener.mjs open <service-slug> [<service-slug> ...]
//     prints one line per window: <service-slug> <window-url> <target-id>
//   node navigator_chrome_session_windows_opener.mjs close <target-id> [<target-id> ...]

import { pathToFileURL } from "node:url";

// Same endpoint as stage-02-playwright-mcp.json.
export const NAVIGATOR_CDP_HTTP_ENDPOINT = "http://127.0.0.1:9222";
// The navigator screen (skill real-chrome-web-navigator, chrome_launch_command_builder.py) is
// 3840x2160: a 2x2 grid of 1920x1080 cells. The main Chrome window lies under the first cell
// and is not used during stage 02.
export const MOSAIC_CELL_WIDTH_PX = 1920;
export const MOSAIC_CELL_HEIGHT_PX = 1080;
export const MOSAIC_COLUMN_COUNT = 2;
export const MOSAIC_CELL_COUNT = 4;
// A researcher finds its window among the browser tabs by this address plus the service slug.
export const SESSION_WINDOW_URL_PREFIX = "about:blank#stage-02-session-window-";
// A local Chrome answers in milliseconds; the limit only catches a hung browser.
const CDP_REPLY_TIMEOUT_MS = 10000;
const SERVICE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const USAGE = "Usage: node navigator_chrome_session_windows_opener.mjs open <service-slug> ... | close <target-id> ...";
const EXIT_CODE_FAILURE = 1;
const EXIT_CODE_BAD_ARGUMENTS = 2;

/** Returns the screen bounds of one mosaic cell, counted left to right, then top to bottom. */
export function mosaicCellBounds(cellIndex) {
  return {
    left: (cellIndex % MOSAIC_COLUMN_COUNT) * MOSAIC_CELL_WIDTH_PX,
    top: Math.floor(cellIndex / MOSAIC_COLUMN_COUNT) * MOSAIC_CELL_HEIGHT_PX,
    width: MOSAIC_CELL_WIDTH_PX,
    height: MOSAIC_CELL_HEIGHT_PX,
    windowState: "normal",
  };
}

/** Returns the address of the window opened for one service. */
export function sessionWindowUrl(serviceSlug) {
  return `${SESSION_WINDOW_URL_PREFIX}${serviceSlug}`;
}

/** Throws a specific error when the service slugs cannot be laid out as one mosaic. */
export function validateServiceSlugs(serviceSlugs) {
  if (serviceSlugs.length === 0) throw new Error("open needs at least one service slug");
  if (serviceSlugs.length > MOSAIC_CELL_COUNT) {
    throw new Error(`The navigator screen holds ${MOSAIC_CELL_COUNT} session windows, got ${serviceSlugs.length} service slugs`);
  }
  const malformedSlug = serviceSlugs.find((serviceSlug) => !SERVICE_SLUG_PATTERN.test(serviceSlug));
  if (malformedSlug !== undefined) {
    throw new Error(`Service slug must be lowercase letters, digits and hyphens: ${malformedSlug}`);
  }
  if (new Set(serviceSlugs).size !== serviceSlugs.length) {
    throw new Error(`Service slugs repeat: ${serviceSlugs.join(" ")}`);
  }
}

/** Reads the browser-level WebSocket URL from the CDP HTTP endpoint. */
async function readBrowserWebSocketUrl(cdpHttpEndpoint) {
  const response = await fetch(`${cdpHttpEndpoint}/json/version`);
  if (!response.ok) {
    throw new Error(`Navigator Chrome at ${cdpHttpEndpoint} answered HTTP ${response.status}`);
  }
  const versionInfo = await response.json();
  if (typeof versionInfo.webSocketDebuggerUrl !== "string") {
    throw new Error(`Navigator Chrome at ${cdpHttpEndpoint} returned no webSocketDebuggerUrl`);
  }
  return versionInfo.webSocketDebuggerUrl;
}

/** Opens the browser WebSocket and resolves once it is ready for commands. */
function openCdpSocket(browserWebSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(browserWebSocketUrl);
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error(`Cannot open the CDP WebSocket ${browserWebSocketUrl}`));
  });
}

let lastCdpMessageId = 0;

/** Sends one CDP command and resolves with its result; rejects on a CDP error or no reply. */
function sendCdpCommand(socket, method, params) {
  const messageId = ++lastCdpMessageId;
  return new Promise((resolve, reject) => {
    const replyTimer = setTimeout(
      () => reject(new Error(`Chrome sent no ${method} reply within ${CDP_REPLY_TIMEOUT_MS} ms`)), CDP_REPLY_TIMEOUT_MS);
    socket.addEventListener("message", function onReply(event) {
      const reply = JSON.parse(event.data);
      if (reply.id !== messageId) return;
      clearTimeout(replyTimer);
      socket.removeEventListener("message", onReply);
      if (reply.error) reject(new Error(`${method} failed: ${reply.error.message}`));
      else resolve(reply.result);
    });
    socket.send(JSON.stringify({ id: messageId, method, params }));
  });
}

/** Opens one window per service in its mosaic cell and returns the output lines. */
async function openSessionWindows(socket, serviceSlugs) {
  const outputLines = [];
  for (const [cellIndex, serviceSlug] of serviceSlugs.entries()) {
    const windowUrl = sessionWindowUrl(serviceSlug);
    const { targetId } = await sendCdpCommand(socket, "Target.createTarget", { url: windowUrl, newWindow: true });
    const { windowId } = await sendCdpCommand(socket, "Browser.getWindowForTarget", { targetId });
    await sendCdpCommand(socket, "Browser.setWindowBounds", { windowId, bounds: mosaicCellBounds(cellIndex) });
    outputLines.push(`${serviceSlug} ${windowUrl} ${targetId}`);
  }
  return outputLines;
}

/** Closes the windows opened for a round by their target ids. */
async function closeSessionWindows(socket, targetIds) {
  for (const targetId of targetIds) {
    await sendCdpCommand(socket, "Target.closeTarget", { targetId });
  }
}

/** Runs one command against the navigator Chrome and returns the lines to print. */
async function runCommand(command, commandArguments) {
  if (command === "open") validateServiceSlugs(commandArguments);
  const socket = await openCdpSocket(await readBrowserWebSocketUrl(NAVIGATOR_CDP_HTTP_ENDPOINT));
  try {
    if (command === "open") return await openSessionWindows(socket, commandArguments);
    await closeSessionWindows(socket, commandArguments);
    return [];
  } finally {
    socket.close();
  }
}

async function main() {
  const [command, ...commandArguments] = process.argv.slice(2);
  const knownCommand = command === "open" || command === "close";
  if (!knownCommand || (command === "close" && commandArguments.length === 0)) {
    console.error(USAGE);
    process.exit(EXIT_CODE_BAD_ARGUMENTS);
  }
  const outputLines = await runCommand(command, commandArguments);
  for (const outputLine of outputLines) console.log(outputLine);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`navigator_chrome_session_windows_opener: ${error.message}`);
    process.exit(EXIT_CODE_FAILURE);
  });
}
