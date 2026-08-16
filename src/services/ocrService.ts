import {
  prepareReceiptForOcr,
  ReceiptImageTooLargeError,
} from '@/lib/prepare-receipt-image';
import { normalizeOcrExtraction } from '@/lib/ocr-receipt-parse';
import { supabase } from '@/lib/supabase';
import type { OcrExtractionResult } from '@/types/database';

export type OcrFailureCode =
  | 'unavailable'
  | 'unauthorized'
  | 'forbidden'
  | 'misconfigured'
  | 'provider_rejected'
  | 'upstream'
  | 'empty'
  | 'image_too_large'
  | 'unknown';

export class OcrServiceError extends Error {
  readonly code: OcrFailureCode;

  constructor(code: OcrFailureCode, message: string) {
    super(message);
    this.name = 'OcrServiceError';
    this.code = code;
  }
}

type EdgeErrorPayload = {
  error?: string;
  code?: string;
  upstream_status?: number;
  upstream_detail?: string;
};

function mapEdgeCode(raw: string | undefined): OcrFailureCode {
  switch (raw) {
    case 'misconfigured':
      return 'misconfigured';
    case 'provider_rejected':
      return 'provider_rejected';
    case 'upstream':
      return 'upstream';
    case 'bad_request':
      return 'unknown';
    default:
      return 'unknown';
  }
}

function classifyEdgeMessage(raw: string): OcrFailureCode {
  const lower = raw.toLowerCase();
  if (
    lower.includes('moonshot_api_key') ||
    lower.includes('misconfigured') ||
    lower.includes('not configured')
  ) {
    return 'misconfigured';
  }
  if (lower.includes('provider rejected')) {
    return 'provider_rejected';
  }
  if (
    lower.includes('unauthorized') ||
    lower.includes('missing authorization') ||
    lower.includes('missing session') ||
    lower.includes('not signed in') ||
    lower.includes('401')
  ) {
    return 'unauthorized';
  }
  if (lower.includes('forbidden') || lower.includes('403')) return 'forbidden';
  if (
    lower.includes('non-2xx') ||
    lower.includes('name resolution') ||
    lower.includes('failed to fetch') ||
    lower.includes('network')
  ) {
    return 'unavailable';
  }
  if (lower.includes('kimi') || lower.includes('502') || lower.includes('upstream')) {
    return 'upstream';
  }
  return 'unknown';
}

function formatProviderRejectedMessage(payload: EdgeErrorPayload): string {
  const status = payload.upstream_status;
  const detail = payload.upstream_detail?.trim();
  const parts = ['OCR provider rejected the request'];
  if (typeof status === 'number') {
    parts[0] = `${parts[0]} (${status})`;
  }
  if (detail) {
    parts.push(detail);
  }
  return parts.join(': ');
}

function resolveEdgeFailure(payload: EdgeErrorPayload, fallbackMessage: string): OcrServiceError {
  const code =
    typeof payload.code === 'string' && payload.code.trim()
      ? mapEdgeCode(payload.code.trim())
      : classifyEdgeMessage(payload.error ?? fallbackMessage);

  if (code === 'provider_rejected') {
    return new OcrServiceError(code, formatProviderRejectedMessage(payload));
  }

  const message =
    typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : fallbackMessage;

  return new OcrServiceError(code, message);
}

async function readFunctionsErrorBody(error: unknown): Promise<EdgeErrorPayload | null> {
  if (!error || typeof error !== 'object') return null;
  const context = (error as { context?: Response }).context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    const body = (await context.json()) as EdgeErrorPayload & { message?: string };
    if (!body.error && typeof body.message === 'string') {
      body.error = body.message;
    }
    return body;
  } catch {
    try {
      const text = await context.text();
      return text.trim() ? { error: text.trim() } : null;
    } catch {
      return null;
    }
  }
}

/**
 * Edge Functions need the user access token (not the anon key). Refresh when
 * close to expiry so local OCR does not return a misleading 401.
 */
async function requireAccessToken(): Promise<string> {
  const { data: initial, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new OcrServiceError('unauthorized', sessionError.message);
  }

  let session = initial.session;
  const expiresAtMs = (session?.expires_at ?? 0) * 1000;
  const needsRefresh = !session?.access_token || expiresAtMs < Date.now() + 60_000;

  if (needsRefresh) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw new OcrServiceError('unauthorized', refreshError.message);
    }
    session = refreshed.session;
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new OcrServiceError('unauthorized', 'Not signed in.');
  }
  return accessToken;
}

/**
 * Extract girvi receipt fields via the extract-receipt Edge Function
 * (Moonshot key stays server-side). Hindi and English handwriting both OK —
 * values are returned as written (Devanagari kept).
 *
 * Returns a JPEG-resized `preparedUri` suitable for the review thumbnail and
 * storage upload (gallery HEIC/large stills are compressed first).
 */
export async function extractReceiptData(localImageUri: string): Promise<{
  extraction: OcrExtractionResult;
  preparedUri: string;
}> {
  let prepared;
  try {
    prepared = await prepareReceiptForOcr(localImageUri);
  } catch (error) {
    if (error instanceof ReceiptImageTooLargeError) {
      throw new OcrServiceError('image_too_large', error.message);
    }
    throw error;
  }

  const accessToken = await requireAccessToken();

  const { data, error } = await supabase.functions.invoke<OcrExtractionResult | EdgeErrorPayload>(
    'extract-receipt',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        image_base64: prepared.base64,
        mime_type: prepared.mimeType,
      },
    },
  );

  if (error) {
    const payload = await readFunctionsErrorBody(error);
    if (payload) {
      throw resolveEdgeFailure(payload, error.message);
    }
    throw new OcrServiceError(classifyEdgeMessage(error.message), error.message);
  }

  if (!data) {
    throw new OcrServiceError('empty', 'OCR edge function returned an empty response.');
  }

  if ('error' in data && typeof data.error === 'string') {
    throw resolveEdgeFailure(data as EdgeErrorPayload, data.error);
  }

  return {
    extraction: normalizeOcrExtraction(
      data as Partial<OcrExtractionResult> & Record<string, unknown>,
    ),
    preparedUri: prepared.uri,
  };
}

/** Map OCR failures to i18n keys under loans.scanner.* */
export function ocrErrorMessageKey(error: unknown): string {
  if (error instanceof OcrServiceError) {
    switch (error.code) {
      case 'unavailable':
        return 'loans.scanner.ocrUnavailable';
      case 'unauthorized':
        return 'loans.scanner.ocrUnauthorized';
      case 'forbidden':
        return 'loans.scanner.ocrForbidden';
      case 'misconfigured':
        return 'loans.scanner.ocrMisconfigured';
      case 'provider_rejected':
        return 'loans.scanner.ocrProviderRejected';
      case 'upstream':
        return 'loans.scanner.ocrUpstream';
      case 'empty':
        return 'loans.scanner.ocrEmpty';
      case 'image_too_large':
        return 'loans.scanner.ocrImageTooLarge';
      case 'unknown':
        return 'loans.scanner.ocrFailed';
      default: {
        const _exhaustive: never = error.code;
        return _exhaustive;
      }
    }
  }
  return 'errors.unknown';
}

/** Prefer a detailed provider message when the edge function returned one. */
export function ocrErrorDisplayMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof OcrServiceError) {
    if (error.code === 'provider_rejected' && error.message.includes(':')) {
      return error.message;
    }
    if (error.code === 'upstream' && error.message.trim() && !error.message.includes('non-2xx')) {
      return error.message;
    }
  }
  const key = ocrErrorMessageKey(error);
  if (key === 'errors.unknown' && error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return t(key);
}
