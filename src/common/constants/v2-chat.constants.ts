/**
 * V2 Chat, Media & Attachment Constants
 */

export const CHAT_KEY_REGEX =
  /^chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|m4a|ogg|webm|pdf|docx|xlsx|pptx|doc|xls|ppt|txt|csv|zip)$/;

export const CHAT_IMAGE_MIME_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export const CHAT_VIDEO_MIME_MAP = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
} as const;

export const CHAT_VOICE_MIME_MAP = {
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
} as const;

export const CHAT_FILE_MIME_MAP = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
} as const;

export const ALL_CHAT_ALLOWED_MIME_TYPES = [
  ...Object.keys(CHAT_IMAGE_MIME_MAP),
  ...Object.keys(CHAT_VIDEO_MIME_MAP),
  ...Object.keys(CHAT_VOICE_MIME_MAP),
  ...Object.keys(CHAT_FILE_MIME_MAP),
] as const;
