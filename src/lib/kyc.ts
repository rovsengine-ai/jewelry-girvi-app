import type { IdDocumentType } from '@/types/database';

const LAST4_RE = /^[0-9A-Za-z]{4}$/;

/** Last 4 only. The CHECK on profiles.id_document_last4 is the same pattern. */
export function normalizeIdLast4(input: string): string {
  const trimmed = input.trim().toUpperCase();
  if (!LAST4_RE.test(trimmed)) {
    throw new Error('Store only the last 4 characters of the ID, not the full number.');
  }
  return trimmed;
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

export function kycStatusLabel(verifiedOn: string | null): string {
  if (verifiedOn) {
    return `Verified ${verifiedOn}`;
  }
  return 'Not verified';
}
