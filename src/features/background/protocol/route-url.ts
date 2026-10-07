import type { RuntimeResponse } from '@/library/messages';
import type { DownloadCaptureType } from '@/library/storage';
import type { AddDownloadInput, MediaCandidate } from '@/library/rpc';

import { loadSnapshot } from '@/library/storage';
import { filenameFromUrl } from '@/library/download/filename-metadata';
import { getDownloadCaptureType, isProtocolEnabled, isUrlBlocked } from '@/library/download/filter';
import {
  formatMediaPickerError,
  isSocialMediaUrl,
  normalizeSocialMediaPageUrl,
  resolveSocialMedia,
} from '@/library/social/resolver';

import { getCookieHeader } from '../cookies';
import { openDownloadPicker } from '../downloads/picker';
import { routeDownloadInput } from '../downloads/route-download-input';
import { duplicateGuard, filenameMetadata, requestContexts } from '../downloads/state';

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isYouTubeUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be';
  } catch {
    return false;
  }
}

function isPageDocumentUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return /\.(?:html?|php)$/i.test(parsed.pathname)
      || /^\/view_video\.php(?:\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isDirectMediaCandidate(value: string): boolean {
  if (!isHttpUrl(value) || isPageDocumentUrl(value)) return false;
  if (/\.(?:m3u8|mpd|m4s|ts)(?:$|[?#])/i.test(value) || /(?:^|[/_-])(?:seg|segment|chunk|fragment)[-_/]/i.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return /\.(?:mp4|m4v|webm)(?:$|[?#])/i.test(parsed.pathname)
      || /(?:^|\.)googlevideo\.com$/i.test(parsed.hostname)
      || (/(?:^|\.)fbcdn\.net$/i.test(parsed.hostname) && /\/v\/t\d+(?:[./_-]|$)/i.test(parsed.pathname))
      || /\/video\/get_media(?:[/?]|$)/i.test(parsed.pathname)
      || /\/videoplayback(?:[/?]|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function selectDownloadUrl(url: string, candidates: string[]): string {
  return candidates.find(isDirectMediaCandidate)
    || (isSocialMediaUrl(url) ? url : candidates.find((candidate) => !isPageDocumentUrl(candidate)) || url);
}

function buildMediaCandidates(
  urls: string[],
  suppliedCandidates: MediaCandidate[] | undefined,
  primaryFileSize: number | undefined,
): MediaCandidate[] {
  const suppliedByUrl = new Map((suppliedCandidates || []).map((candidate) => [candidate.url, candidate]));
  return urls.map((candidateUrl) => {
    const supplied = suppliedByUrl.get(candidateUrl);
    const metadata = filenameMetadata.resolve([candidateUrl]);
    return {
      url: candidateUrl,
      filename: supplied?.filename || metadata?.filename || filenameFromUrl(candidateUrl),
      fileSize: supplied?.fileSize ?? metadata?.fileSize ?? (candidateUrl === urls[0] ? primaryFileSize : undefined),
    };
  });
}

export async function routeUrl(
  url: string,
  pageUrl: string,
  source: string,
  filename?: string,
  captureType?: DownloadCaptureType,
  candidateUrls?: string[],
  fileSize?: number,
  suppliedMediaCandidates?: MediaCandidate[],
): Promise<RuntimeResponse> {
  const snapshot = await loadSnapshot();
  const mediaCandidateUrls = [
    url,
    ...(candidateUrls || []),
    ...(suppliedMediaCandidates || []).map((candidate) => candidate.url),
  ].filter((candidate, index, values) => isHttpUrl(candidate) && values.indexOf(candidate) === index);
  const mediaCandidates = buildMediaCandidates(mediaCandidateUrls, suppliedMediaCandidates, fileSize);
  const routedUrl = selectDownloadUrl(url, mediaCandidateUrls);
  const directMediaCandidates = mediaCandidates.filter((candidate) => isDirectMediaCandidate(candidate.url));
  const pickerCandidates = (directMediaCandidates.length ? directMediaCandidates : mediaCandidates).filter(
    (candidate) => !isPageDocumentUrl(candidate.url) || candidate.url === routedUrl,
  );
  if (!isProtocolEnabled(routedUrl, snapshot.settings)) {
    return { ok: false, code: 'disabled', message: 'This protocol is disabled' };
  }
  if (isUrlBlocked(routedUrl, pageUrl, snapshot.settings, snapshot.siteRules)) {
    return { ok: false, code: 'site_rule_blocked', message: 'Downloads are blocked for this site' };
  }
  if (captureType && !snapshot.settings.captureTypes[captureType]) {
    return { ok: false, code: 'capture_type_disabled', message: `${captureType} capture is disabled` };
  }
  if (!duplicateGuard.reserve([routedUrl, pageUrl])) {
    return { ok: true, result: 'duplicate-blocked' };
  }
  const requestContext = requestContexts.resolve([routedUrl, ...mediaCandidateUrls]);
  const resolverPageUrl = normalizeSocialMediaPageUrl(pageUrl)
    || normalizeSocialMediaPageUrl(routedUrl)
    || (isYouTubeUrl(pageUrl) ? pageUrl : undefined);
  const cookie = snapshot.settings.forwardCookies
    ? requestContext?.cookie || await getCookieHeader(resolverPageUrl || routedUrl)
    : undefined;
  let input: AddDownloadInput;
  if (resolverPageUrl) {
    try {
      input = await resolveSocialMedia({
        url: resolverPageUrl,
        cookie,
        userAgent: requestContext?.userAgent,
      });
    } catch (error) {
      return {
        ok: false,
        code: 'media_picker_unavailable',
        message: formatMediaPickerError(error, resolverPageUrl || pageUrl),
      };
    }
    input = {
      ...input,
      referer: input.referer || requestContext?.referer || pageUrl,
      cookie,
      finalUrl: resolverPageUrl,
      requestHeaders: input.requestHeaders || requestContext?.requestHeaders,
      filename: input.filename,
      dir: snapshot.settings.defaultDir || undefined,
      candidateUrls: undefined,
      mediaCandidates: [{ url: input.url, filename: input.filename, fileSize: input.fileSize ?? fileSize }],
      fileSize: input.fileSize ?? fileSize,
    };
  } else {
    input = {
      url: routedUrl,
      finalUrl: routedUrl !== url ? url : undefined,
      referer: requestContext?.referer || pageUrl,
      cookie,
      filename: filename || filenameFromUrl(routedUrl),
      requestHeaders: requestContext?.requestHeaders,
      userAgent: requestContext?.userAgent,
      dir: snapshot.settings.defaultDir || undefined,
      candidateUrls: pickerCandidates.length > 1 ? pickerCandidates.map((candidate) => candidate.url) : undefined,
      mediaCandidates: pickerCandidates.length > 1 ? pickerCandidates : undefined,
      fileSize: pickerCandidates.find((candidate) => candidate.url === routedUrl)?.fileSize ?? fileSize,
    };
  }
  const resolvedCaptureType = captureType || getDownloadCaptureType(input);
  if (!snapshot.settings.captureTypes[resolvedCaptureType]) {
    return { ok: false, code: 'capture_type_disabled', message: `${resolvedCaptureType} capture is disabled` };
  }
  if (snapshot.settings.promptBeforeDownload || (input.mediaCandidates?.length || 0) > 1) {
    await openDownloadPicker(input, source);
    return { ok: true, result: 'picker-opened' };
  }
  await routeDownloadInput(input, snapshot, source);
  return { ok: true, result: 'routed' };
}
