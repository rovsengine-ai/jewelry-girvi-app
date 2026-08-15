import { translate, type AppLanguage } from '@/i18n';
import type { IdDocumentType } from '@/types/database';

const LAST4_RE = /^[0-9A-Za-z]{4}$/;
const LAST4_TOO_LONG_ERROR =
  'Store only the last 4 characters of the ID, not the full number.';

export const ID_DOCUMENT_TYPE_OPTIONS: Array<{ value: IdDocumentType; label: string }> = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'passport', label: 'Passport' },
];

/** Last 4 only. The CHECK on profiles.id_document_last4 is the same pattern. */
export function normalizeIdLast4(input: string): string {
  const trimmed = input.trim().toUpperCase();
  if (!LAST4_RE.test(trimmed)) {
    throw new Error(LAST4_TOO_LONG_ERROR);
  }
  return trimmed;
}

/**
 * Draft last-4 for the capture field. Longer input is rejected outright —
 * never sliced — so a pasted 12-digit Aadhaar never enters React state.
 */
export function acceptLast4Draft(
  next: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (next.length > 4) {
    return { ok: false, error: LAST4_TOO_LONG_ERROR };
  }
  return { ok: true, value: next };
}

/**
 * UIDAI: an unmasked Aadhaar photo is the full 12-digit number.
 * Mirrors profiles_no_aadhaar_image_chk — the UI must refuse before upload.
 */
export function assertKycPhotoAllowed(
  documentType: IdDocumentType | null,
  storagePath: string | null,
): void {
  if (documentType === 'aadhaar' && storagePath) {
    throw new Error(
      'Aadhaar photos cannot be stored. An unmasked card image is the full number, and this shop has no UIDAI masking pipeline.',
    );
  }
}

export function kycStatusLabel(verifiedOn: string | null, language?: AppLanguage): string {
  if (verifiedOn) {
    return translate('kyc.verified', { date: verifiedOn }, language);
  }
  return translate('kyc.notVerified', undefined, language);
}
