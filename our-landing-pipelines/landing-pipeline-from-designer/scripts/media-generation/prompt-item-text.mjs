// Проверка элементов prompts.json и тексты для генераторов: Astra рисует изображения и первые кадры роликов,
// Seedance 2.5 в Dreamina оживляет первый кадр. Формат prompts.json прежний:
// [{ id, type, prompt, negative, aspect_ratio, quality, duration, variants, input }].

export const IMAGE_ITEM_TYPE = 'image';
export const VIDEO_ITEM_TYPE = 'video';
const ITEM_TYPES = new Set([IMAGE_ITEM_TYPE, VIDEO_ITEM_TYPE]);
// id становится частью имени файла в raw/: только латиница, цифры, «-» и «_», без выхода из папки.
const ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
// Dreamina рендерит Seedance 2.5 только в двух формах кадра (dreamina_render_settings.py рендерера).
export const DREAMINA_WIDE_ASPECT_RATIO = '16:9';
export const DREAMINA_TALL_ASPECT_RATIO = '9:16';
const ASPECT_RATIO_PATTERN = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;
// У ролика один вариант: каждый рендер стоит кредитов (skills/media, «Видео дорогое»).
const VIDEO_VARIANT_COUNT = 1;
// Длительность ролика, если элемент её не задал: как в tests/test-prompts.json.
export const DEFAULT_VIDEO_DURATION_SECONDS = 5;
const START_FRAME_LEAD = 'The first frame of a short video clip: a still photo of the opening moment of the scene '
  + 'described below, sharp, no motion blur, no text, letters or logos.';
// Снимки для правки «до/после»: input.images = [{ type: 'base64', data: 'data:image/jpeg;base64,…' }].
const ATTACHMENT_TYPE = 'base64';
const DATA_URI_PATTERN = /^data:image\/(png|jpe?g|webp);base64,(.+)$/s;

function itemProblem(item, seenIds) {
  if (!item || typeof item !== 'object') return 'не объект';
  if (!ITEM_ID_PATTERN.test(String(item.id ?? ''))) return `id «${item.id}» — только латиница, цифры, «-» и «_»`;
  if (!ITEM_TYPES.has(item.type)) return `type «${item.type}» — нужен image или video`;
  if (typeof item.prompt !== 'string' || !item.prompt.trim()) return 'пустой prompt';
  if (seenIds.has(item.id)) return `id «${item.id}» повторяется`;
  return null;
}

/** Return the items of prompts.json, throwing a named error for the first invalid one. */
export function validatePromptItems(items) {
  if (!Array.isArray(items)) throw new Error('prompts.json должен быть массивом элементов');
  const seenIds = new Set();
  for (const [index, item] of items.entries()) {
    const problem = itemProblem(item, seenIds);
    if (problem) throw new Error(`элемент ${index + 1}: ${problem}`);
    seenIds.add(item.id);
  }
  return items;
}

/** Return how many variants to generate: one for a clip, the item's own or the run's count for an image. */
export function variantCountOf(item, runVariantCount) {
  if (item.type === VIDEO_ITEM_TYPE) return VIDEO_VARIANT_COUNT;
  return Number(item.variants) || runVariantCount;
}

/** Return the file name stem of one variant, as before: <id>-v<N>. */
export function variantTag(item, variant) {
  return `${item.id}-v${variant}`;
}

/** Return the Astra prompt of an item: its text with the frame shape, quality and what to avoid. */
export function imagePromptText(item) {
  const parts = [item.prompt.trim()];
  if (item.aspect_ratio) parts.push(`Aspect ratio: ${item.aspect_ratio}.`);
  if (item.quality) parts.push(`Quality: ${item.quality}.`);
  if (item.negative) parts.push(`Avoid: ${item.negative}`);
  return parts.join('\n\n');
}

/** Return the Astra prompt of a clip's first frame in the Dreamina frame shape. */
export function startFramePromptText(item, dreaminaAspectRatio) {
  return imagePromptText({ ...item, aspect_ratio: dreaminaAspectRatio, prompt: `${START_FRAME_LEAD}\n\n${item.prompt.trim()}` });
}

/** Map an aspect ratio to the Dreamina frame shape: landscape to 16:9, portrait and square to 9:16. */
export function dreaminaAspectRatioFor(aspectRatio = DREAMINA_WIDE_ASPECT_RATIO) {
  const requested = String(aspectRatio).trim();
  const match = ASPECT_RATIO_PATTERN.exec(requested);
  if (!match) throw new Error(`aspect_ratio «${aspectRatio}» не похож на «ширина:высота»`);
  const label = Number(match[1]) > Number(match[2]) ? DREAMINA_WIDE_ASPECT_RATIO : DREAMINA_TALL_ASPECT_RATIO;
  return { label, replaced: label !== requested };
}

/** Return the attachments of an item as [{ extension, bytes }], refusing anything but base64 image data URIs. */
export function decodedAttachmentsOf(item) {
  return (item.input?.images ?? []).map((image, index) => {
    const match = DATA_URI_PATTERN.exec(String(image?.data ?? ''));
    if (image?.type !== ATTACHMENT_TYPE || !match) throw new Error(`${item.id}: вложение ${index + 1} не data:image/…;base64`);
    return { extension: match[1] === 'jpeg' ? 'jpg' : match[1], bytes: Buffer.from(match[2], 'base64') };
  });
}
