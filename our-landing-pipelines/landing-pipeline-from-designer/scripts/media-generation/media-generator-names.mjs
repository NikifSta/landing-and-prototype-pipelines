// Имена генераторов в .env, журнале raw/log.json и recipe.json: по ним скрипты решают, какие генерации доступны.

/** Images and clip start frames: Astra (gpt-6-astra) through Codex signed in to ChatGPT. */
export const IMAGE_GENERATOR_NAME = 'astra-via-codex';

/** Clips: Seedance 2.5 on the Dreamina site through the navigator Chrome. */
export const VIDEO_GENERATOR_NAME = 'seedance-2-5-in-dreamina';
