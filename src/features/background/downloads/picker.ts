import type { AddDownloadInput } from '@/library/rpc';
import type { StorageSnapshot } from '@/library/storage';
import type { RuntimeResponse } from '@/library/messages';

import { loadSnapshot } from '@/library/storage';
import { filenameFromUrl, isWeakFilename, sanitizeFilename } from '@/library/download/filename-metadata';
import {
  formatMediaPickerError,
  isGenericSocialTitle,
  isSocialMediaUrl,
  normalizeSocialMediaPageUrl,
  resolveSocialMedia,
} from '@/library/social/resolver';

import { routeDownloadInput } from './route-download-input';

export interface PendingPicker {
  id: string;
  source: string;
  createdAt: number;
  input: AddDownloadInput;
}

const PICKER_KEY_PREFIX = 'motrix-picker:';

function storageKey(id: string): string {
  return `${PICKER_KEY_PREFIX}${id}`;
}

function safeOutputName(value: string | undefined, fallback = 'download'): string {
  const cleaned = sanitizeFilename(value || fallback).replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

function resolvePickerFilename(input: AddDownloadInput): string {
  const urlFilename = filenameFromUrl(input.finalUrl || input.url);
  const inputFilename = input.filename && !isWeakFilename(input.filename) ? input.filename : undefined;
  return safeOutputName(inputFilename || urlFilename || input.filename, 'download');
}

export async function openDownloadPicker(input: AddDownloadInput, source: string): Promise<string> {
  const id = crypto.randomUUID();
  const pendingInput: AddDownloadInput = { ...input, filename: resolvePickerFilename(input) };
  const pending: PendingPicker = { id, input: pendingInput, source, createdAt: Date.now() };
  await browser.storage.local.set({ [storageKey(id)]: pending });
  const pickerUrl = browser.runtime.getURL(`/picker.html?id=${encodeURIComponent(id)}`);
  const sourceCount = Math.max(input.mediaCandidates?.length || 0, input.candidateUrls?.length || 0);
  const windowSize = sourceCount > 1
    ? { width: 640, height: 560 }
    : { width: 560, height: 500 };
  try {
    await browser.windows.create({ url: pickerUrl, type: 'popup', ...windowSize });
  } catch {
    await browser.tabs.create({ url: pickerUrl });
  }
  return id;
}

export async function getPendingPicker(id: string): Promise<PendingPicker | undefined> {
  const stored = await browser.storage.local.get(storageKey(id));
  const pending = stored[storageKey(id)] as PendingPicker | undefined;
  if (!pending) return undefined;
  if (Date.now() - pending.createdAt > 30 * 60 * 1000) {
    await deletePendingPicker(id);
    return undefined;
  }
  return pending;
}

export async function deletePendingPicker(id: string): Promise<void> {
  await browser.storage.local.remove(storageKey(id));
}

export async function submitPendingPicker(
  id: string,
  filename: string,
  selectedUrl?: string,
): Promise<void> {
  const pending = await getPendingPicker(id);
  if (!pending) throw new Error('The download picker request has expired');
  const snapshot = await loadSnapshot();
  const selectedCandidate = pending.input.mediaCandidates?.find((candidate) => candidate.url === selectedUrl);
  const selectedInputUrl = selectedCandidate?.url || pending.input.url;
  const pageUrl = pending.input.finalUrl;
  const socialPageUrl = pageUrl ? normalizeSocialMediaPageUrl(pageUrl) : undefined;
  let resolvedInput: AddDownloadInput | undefined;
  if (socialPageUrl && isSocialMediaUrl(socialPageUrl)) {
    try {
      resolvedInput = await resolveSocialMedia({
        url: socialPageUrl,
        cookie: pending.input.cookie,
        userAgent: pending.input.userAgent,
      });
    } catch (error) {
      throw new Error(formatMediaPickerError(error, socialPageUrl));
    }
  }
  const pickerFilename = isGenericSocialTitle(filename)
    ? resolvedInput?.filename || selectedCandidate?.filename || resolvePickerFilename(pending.input)
    : filename;
  const input: AddDownloadInput = {
    ...pending.input,
    ...resolvedInput,
    url: resolvedInput?.url || selectedInputUrl,
    fileSize: resolvedInput?.fileSize ?? selectedCandidate?.fileSize ?? pending.input.fileSize,
    finalUrl: socialPageUrl || pageUrl,
    filename: safeOutputName(pickerFilename, resolvePickerFilename(pending.input)),
    dir: snapshot.settings.defaultDir || undefined,
  };
  await routeDownloadInput(input, snapshot, `${pending.source}_picker`);
  await deletePendingPicker(id);
}

export async function cancelPendingPicker(id: string): Promise<void> {
  await deletePendingPicker(id);
}

export async function handlePickerMessage(message: {
  type: 'picker:get' | 'picker:submit' | 'picker:cancel';
  id: string;
  filename?: string;
  selectedUrl?: string;
}): Promise<RuntimeResponse> {
  if (message.type === 'picker:get') {
    const pending = await getPendingPicker(message.id);
    return pending ? { ok: true, result: pending } : { ok: false, code: 'picker_expired', message: 'The download picker request has expired' };
  }
  if (message.type === 'picker:cancel') {
    await cancelPendingPicker(message.id);
    return { ok: true };
  }
  await submitPendingPicker(message.id, message.filename || '', message.selectedUrl);
  return { ok: true };
}

export function pickerInputDefaults(pending: PendingPicker): { filename: string } {
  return { filename: resolvePickerFilename(pending.input) };
}

export type PickerSnapshot = StorageSnapshot;
