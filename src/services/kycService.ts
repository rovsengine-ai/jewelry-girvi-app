import { readLocalImageBytes } from '@/lib/read-local-image-bytes';

import { assertKycPhotoAllowed, normalizeIdLast4 } from '@/lib/kyc';
import { prepareCustomerPhoto } from '@/lib/prepare-customer-photo';
import { todayInKolkata } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import type { IdDocumentType, Profile } from '@/types/database';

/**
 * DOC GATE (Expo SDK 57):
 * https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/
 * package: expo-file-system  last-modified: June 29, 2026
 *
 * Bytes come from readLocalImageBytes (legacy FileSystem on native, fetch on web).
 * https://docs.expo.dev/versions/v57.0.0/sdk/filesystem-legacy/
 */

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const CUSTOMER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Private kyc bucket: `{customer_id}/filename` — ID document, no subfolder. */
const SAFE_KYC_DOC_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i;
/** Face photo: `{customer_id}/photo/filename` — deliberately namespaced. */
const SAFE_KYC_PHOTO_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/photo\/[A-Za-z0-9._-]+$/i;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CustomerKyc = Pick<
  Profile,
  | 'id'
  | 'full_name'
  | 'id_document_type'
  | 'id_document_last4'
  | 'id_document_path'
  | 'photo_path'
  | 'date_of_birth'
  | 'guardian_name'
  | 'kyc_verified_on'
  | 'kyc_verified_by'
>;

export type KycCaptureInput = {
  customerId: string;
  idDocumentType: IdDocumentType | null;
  idDocumentLast4: string;
  dateOfBirth: string;
  guardianName: string;
  idDocumentPath: string | null;
  photoPath?: string | null;
};

function assertCustomerId(customerId: string): string {
  if (!CUSTOMER_UUID_RE.test(customerId)) {
    throw new Error('Invalid customer id for storage path.');
  }
  return customerId;
}

function assertSafeKycDocPath(path: string): string {
  const normalized = path.replace(/^\/+/, '').replace(/\\/g, '/');
  if (
    normalized.includes('../') ||
    normalized.includes('..') ||
    normalized.includes('\\') ||
    !SAFE_KYC_DOC_PATH_RE.test(normalized)
  ) {
    throw new Error('Invalid KYC storage object path.');
  }
  return normalized;
}

function assertSafeKycPhotoPath(path: string): string {
  const normalized = path.replace(/^\/+/, '').replace(/\\/g, '/');
  if (
    normalized.includes('../') ||
    normalized.includes('..') ||
    normalized.includes('\\') ||
    !SAFE_KYC_PHOTO_PATH_RE.test(normalized)
  ) {
    throw new Error('Invalid customer photo storage object path.');
  }
  return normalized;
}

function parseOptionalDate(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') {
    return null;
  }
  if (!DOB_RE.test(trimmed)) {
    throw new Error('Date of birth must be YYYY-MM-DD.');
  }
  return trimmed;
}

function parseOptionalName(input: string): string | null {
  const trimmed = input.trim();
  return trimmed === '' ? null : trimmed;
}

export async function fetchCustomerKyc(customerId: string): Promise<CustomerKyc> {
  const id = assertCustomerId(customerId);
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, id_document_type, id_document_last4, id_document_path, photo_path, date_of_birth, guardian_name, kyc_verified_on, kyc_verified_by',
    )
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('Customer not found.');
  }
  return data as CustomerKyc;
}

export async function resolveKycDisplayUrl(stored: string | null): Promise<string | null> {
  if (!stored) {
    return null;
  }
  const path = assertSafeKycDocPath(stored);
  const { data, error } = await supabase.storage.from('kyc').createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    throw new Error(error.message);
  }
  return data.signedUrl;
}

export async function resolveCustomerPhotoUrl(stored: string | null): Promise<string | null> {
  if (!stored) {
    return null;
  }
  const path = assertSafeKycPhotoPath(stored);
  const { data, error } = await supabase.storage.from('kyc').createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    throw new Error(error.message);
  }
  return data.signedUrl;
}

/**
 * Upload a document photo to the private `kyc` bucket.
 * Path is `{customer_id}/filename` — not the receipts `.../(receipts|items)/...` shape.
 * Aadhaar is refused before any bytes are read.
 */
export async function uploadKycImage(
  localUri: string,
  customerId: string,
  documentType: IdDocumentType | null,
): Promise<string> {
  const safeCustomerId = assertCustomerId(customerId);
  const extension = (localUri.split('.').pop()?.toLowerCase() ?? 'jpg').replace(/[^a-z0-9]/g, '');
  const safeExt = extension === 'png' || extension === 'jpg' || extension === 'jpeg' ? extension : 'jpg';
  const objectPath = assertSafeKycDocPath(
    `${safeCustomerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`,
  );
  assertKycPhotoAllowed(documentType, objectPath);

  const bytes = await readLocalImageBytes(localUri);
  const { error } = await supabase.storage.from('kyc').upload(objectPath, bytes, {
    contentType: safeExt === 'png' ? 'image/png' : 'image/jpeg',
    upsert: false,
  });
  if (error) {
    throw new Error(error.message);
  }
  return objectPath;
}

/** Upload a face photo to `{customer_id}/photo/...`. Not an ID document — Aadhaar ban does not apply. */
export async function uploadCustomerPhoto(localUri: string, customerId: string): Promise<string> {
  const safeCustomerId = assertCustomerId(customerId);
  const prepared = await prepareCustomerPhoto(localUri);
  const objectPath = assertSafeKycPhotoPath(
    `${safeCustomerId}/photo/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
  );

  const bytes = await readLocalImageBytes(prepared.uri);
  const { error } = await supabase.storage.from('kyc').upload(objectPath, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) {
    throw new Error(error.message);
  }
  return objectPath;
}

/** Writes capture columns only. Never kyc_verified_on / kyc_verified_by. */
export async function saveKycCapture(input: KycCaptureInput): Promise<void> {
  const customerId = assertCustomerId(input.customerId);
  const last4 =
    input.idDocumentLast4.trim() === '' ? null : normalizeIdLast4(input.idDocumentLast4);
  const path = input.idDocumentType === 'aadhaar' ? null : input.idDocumentPath;
  assertKycPhotoAllowed(input.idDocumentType, path);

  const payload = {
    id_document_type: input.idDocumentType,
    id_document_last4: last4,
    date_of_birth: parseOptionalDate(input.dateOfBirth),
    guardian_name: parseOptionalName(input.guardianName),
    id_document_path: path,
    ...(input.photoPath !== undefined
      ? {
          photo_path:
            input.photoPath === null ? null : assertSafeKycPhotoPath(input.photoPath),
        }
      : {}),
  };

  const { error } = await supabase.from('profiles').update(payload).eq('id', customerId);
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Deliberate shop verify. Writes both pair columns. Not called from saveKycCapture.
 */
export async function verifyKyc(customerId: string): Promise<void> {
  const id = assertCustomerId(customerId);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message);
  }
  const verifierId = sessionData.session?.user.id;
  if (!verifierId) {
    throw new Error('Not signed in.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      kyc_verified_on: todayInKolkata(),
      kyc_verified_by: verifierId,
    })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}
