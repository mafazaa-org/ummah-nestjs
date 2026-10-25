/** Hard limits mirrored by DB column sizes (posts.text VARCHAR(2000)). Changing them requires a migration. */
export const POST_TEXT_MAX = 2000;
export const MEDIA_MAX_PER_POST = 4;

export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 50;
