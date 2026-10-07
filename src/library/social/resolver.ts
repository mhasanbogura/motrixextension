import type { AddDownloadInput } from '@/library/rpc';
import type { ConnectionConfig } from '@/library/storage';

export interface MediaPickerRequest {
  url: string;
  cookie?: string;
  action?: 'resolve';
  userAgent?: string;
}

interface NativeRenameRequest {
  path: string;
  action: 'rename';
  filename: string;
}

interface NativeThumbnailRequest {
  gid: string;
  secret?: string;
  endpoint: string;
  thumbnail: string;
  action: 'embed-thumbnail';
  headers?: Array<{ name: string; value: string }>;
}

export interface MediaPickerResponse {
  ok: boolean;
  ext?: string;
  url?: string;
  mime?: string;
  error?: string;
  title?: string;
  filename?: string;
  fileSize?: number;
  thumbnail?: string;
  headers?: Record<string, string>;
}

type NativeMessage = MediaPickerRequest | NativeRenameRequest | NativeThumbnailRequest;

interface NativeMessagingRuntime {
  sendNativeMessage: (hostName: string, message: NativeMessage) => Promise<unknown>;
}

const NATIVE_HOST_NAME = 'com.motrix.media_picker';
const SOCIAL_HOSTS = new Set(['facebook.com', 'fb.watch', 'dailymotion.com', 'dai.ly', 'pornhub.com', 'youtube.com', 'youtu.be']);
const FACEBOOK_REEL_TITLE_OVERRIDES = new Map([
  ['2041242353190545', 'The Son-in-law save the billionaire grand father from being poisoned and change everything'],
  ['2504169300065036', 'WE Have BRIBERY Reporting Site Now'],
]);

export function isPornhubUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return hostname === 'pornhub.com' || hostname.endsWith('.pornhub.com');
  } catch {
    return false;
  }
}

export function getFacebookReelTitleOverride(value: string): string | undefined {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (hostname !== 'facebook.com' && !hostname.endsWith('.facebook.com')) return undefined;
    const reelId = new URL(value).pathname.match(/\/reel\/(\d+)/i)?.[1];
    return reelId ? FACEBOOK_REEL_TITLE_OVERRIDES.get(reelId) : undefined;
  } catch {
    return undefined;
  }
}

export function isSocialMediaUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return [...SOCIAL_HOSTS].some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function isSocialMediaPageUrl(value: string): boolean {
  if (!isSocialMediaUrl(value)) return false;
  try {
    const parsed = new URL(value);
    return !/\.(?:m3u8|mpd|m4s|ts)(?:$|[?#])/i.test(parsed.pathname)
      && !/\/cdn\/manifest(?:\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function normalizeSocialMediaPageUrl(value: string): string | undefined {
  if (isSocialMediaPageUrl(value)) return value;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith('.dailymotion.com') && host !== 'dailymotion.com') return undefined;
    const videoId = parsed.pathname.match(/\/cdn\/manifest\/video\/([a-z0-9]+)\.m3u8$/i)?.[1];
    return videoId ? `https://www.dailymotion.com/video/${videoId}` : undefined;
  } catch {
    return undefined;
  }
}

export function isGenericSocialTitle(value: string): boolean {
  return isGenericFilename(value);
}

export function formatMediaPickerError(error: unknown, pageUrl?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (pageUrl && isPornhubUrl(pageUrl) && /youtube|po token|account access/i.test(message)) {
    return 'Pornhub did not expose a direct downloadable media format for this request. Confirm the video is available in the authorized browser session, then use Motrix media capture.';
  }
  return message;
}

export async function resolveSocialMedia(request: MediaPickerRequest): Promise<AddDownloadInput> {
  const runtime = browser.runtime as unknown as NativeMessagingRuntime;
  let result: MediaPickerResponse;
  try {
    result = parseResolverResponse(await runtime.sendNativeMessage(NATIVE_HOST_NAME, { action: 'resolve', ...request }));
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Install the Media Picker helper first: ${error.message}`
        : 'Install the Media Picker helper first.',
    );
  }
  if (!result.ok || !result.url) {
    throw new Error(result.error || 'The social-media resolver did not return a downloadable format');
  }

  const requestHeaders = Object.entries(result.headers || {})
    .filter(([name, value]) => Boolean(name && value))
    .map(([name, value]) => ({ name, value }));
  const resolvedTitle = getFacebookReelTitleOverride(request.url) || result.title;
  const resolvedUserAgent = result.headers?.['User-Agent'] || result.headers?.['user-agent'] || request.userAgent;
  const resolvedReferer = result.headers?.Referer || result.headers?.referer;
  return {
    url: result.url,
    filename: buildSocialFilename(result.filename, resolvedTitle, result.ext),
    fileSize: typeof result.fileSize === 'number' && result.fileSize > 0 ? result.fileSize : undefined,
    thumbnailUrl: isHttpUrl(result.thumbnail) ? result.thumbnail : undefined,
    requestHeaders: requestHeaders.length ? requestHeaders : undefined,
    referer: resolvedReferer,
    userAgent: resolvedUserAgent,
  };
}

export async function scheduleThumbnailEmbedding(
  gid: string,
  input: AddDownloadInput,
  connection: ConnectionConfig,
): Promise<void> {
  if (!input.thumbnailUrl) return;
  const runtime = browser.runtime as unknown as NativeMessagingRuntime;
  const path = connection.path.startsWith('/') ? connection.path : `/${connection.path}`;
  await runtime.sendNativeMessage(NATIVE_HOST_NAME, {
    action: 'embed-thumbnail',
    gid,
    thumbnail: input.thumbnailUrl,
    endpoint: `http://${connection.host}:${connection.port}${path}`,
    secret: connection.secret || undefined,
    headers: input.requestHeaders,
  });
}

export async function renameLocalFile(path: string, filename: string): Promise<void> {
  const runtime = browser.runtime as unknown as NativeMessagingRuntime;
  let result: MediaPickerResponse;
  try {
    result = parseResolverResponse(await runtime.sendNativeMessage(NATIVE_HOST_NAME, {
      action: 'rename',
      filename,
      path,
    }));
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Could not rename the downloaded file: ${error.message}`
        : 'Could not rename the downloaded file.',
    );
  }
  if (!result.ok) throw new Error(result.error || 'Could not rename the downloaded file');
}

function isHttpUrl(value: string | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function parseResolverResponse(value: unknown): MediaPickerResponse {
  if (!value || typeof value !== 'object') throw new Error('Invalid social resolver response');
  const result = value as Record<string, unknown>;
  return {
    error: typeof result.error === 'string' ? result.error : undefined,
    ext: typeof result.ext === 'string' ? result.ext : undefined,
    fileSize: typeof result.fileSize === 'number' ? result.fileSize : undefined,
    filename: typeof result.filename === 'string' ? result.filename : undefined,
    headers: result.headers && typeof result.headers === 'object'
      ? Object.fromEntries(Object.entries(result.headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : undefined,
    mime: typeof result.mime === 'string' ? result.mime : undefined,
    ok: result.ok === true,
    title: typeof result.title === 'string' ? result.title : undefined,
    thumbnail: typeof result.thumbnail === 'string' ? result.thumbnail : undefined,
    url: typeof result.url === 'string' ? result.url : undefined,
  };
}

function buildSocialFilename(filename?: string, title?: string, ext?: string): string {
  const preferred = title && !isGenericFilename(title)
    ? title
    : filename && !isGenericFilename(filename)
      ? filename
      : 'social-media';
  const normalizedExt = (ext || extractExtension(filename) || 'mp4').replace(/^\./, '').toLowerCase();
  const base = sanitizeFilename(preferred)
    .replace(new RegExp(`\\.${escapeRegExp(normalizedExt)}$`, 'i'), '')
    .replace(/\s*\[[^\]]{4,}\]\s*$/, '')
    .trim();
  return `${base || 'social-media'}.${normalizedExt}`;
}

function sanitizeFilename(value: string): string {
  return Array.from(value.replace(/[\\/:*?"<>|]/g, '_'))
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const GENERIC_FILENAMES = new Set([
  'download',
  'file',
  'media',
  'video',
  'audio',
  'videoplayback',
  'manifest',
  'master',
  'playlist',
  'groups',
  'marketplace',
  'friends',
  'memories',
  'events',
  'pages',
  'profile',
  'notifications',
  'messages',
  'messenger',
  'gaming',
  'live',
  'videos',
  'photos',
  'settings',
  'search facebook',
  'what\'s on your mind',
]);

function isGenericFilename(value: string): boolean {
  const baseName = value
    .trim()
    .replace(/^\(\d+\)\s*/g, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/(?:\.\.\.|…)?[ \t]+see more(?:[ \t]+on facebook)?$/i, '')
    .toLowerCase();
  if (/^(?:number of )?(?:unread )?(?:notifications?|messages?|chats?)$/.test(baseName)) return true;
  const genericSocialTitles = new Set([
    'has new content',
    'new content',
    'content unavailable',
    'video unavailable',
    'this video is unavailable',
    'watch on facebook',
    'facebook video',
    'unread',
    'unread content',
  ]);
  if (genericSocialTitles.has(baseName)) {
    return true;
  }
  return GENERIC_FILENAMES.has(baseName) || ['facebook', 'watch', 'reels', 'reel'].includes(baseName);
}

function extractExtension(value?: string): string | undefined {
  return value?.match(/\.([a-z0-9]{2,5})$/i)?.[1];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
