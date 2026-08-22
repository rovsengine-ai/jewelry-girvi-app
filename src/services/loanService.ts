import * as FileSystem from 'expo-file-system/legacy';

import {
  edgeFunctionErrorMessage,
  readEdgeFunctionErrorBody,
  requireUserAccessToken,
} from '@/lib/edge-invoke';
import { kycDraftHasContent, type KycDraft } from '@/lib/kyc-draft';
import { newIdempotencyKey } from '@/lib/idempotency';
import { isReminderKind, type LoanReminderSlot } from '@/lib/loan-reminders';
import { asPaise, percentInputToBps, rupeesInputToPaise, todayInKolkata } from '@/lib/money';
import { toE164India } from '@/lib/phone';
import { prepareItemPhoto } from '@/lib/prepare-item-photo';
import { convertScannerItem, type ScannerItemDraft } from '@/lib/scanner-items';
import { supabase } from '@/lib/supabase';
import { saveKycCapture, uploadCustomerPhoto, uploadKycImage } from '@/services/kycService';
import type { Json } from '@/types/supabase';
import type {
  ArchivedLoan,
  ArchiveLoanResult,
  DefaultLoanResult,
  EditLoanTermsResult,
  InterestModel,
  LoanBalances,
  LoanFormData,
  LoanItem,
  LoanStatus,
  LoanItemPhoto,
  LoanNotice,
  OverdueLoan,
  PartialPeriodMode,
  RateYield,
  RedeemLoanResult,
  RenewLoanResult,
  ShopDefaults,
  UnarchiveLoanResult,
  UnredeemLoanResult,
  UserRole,
} from '@/types/database';

export type CounterCustomerRole = Extract<UserRole, 'retail_customer' | 'merchant'>;

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const CUSTOMER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_STORAGE_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(receipts|signatures|items)\/[A-Za-z0-9._-]+$/i;

/** Reject path traversal and non-namespaced storage keys before SDK calls. */
function assertSafeStoragePath(path: string): string {
  const normalized = path.replace(/^\/+/, '').replace(/\\/g, '/');
  if (
    normalized.includes('../') ||
    normalized.includes('..') ||
    normalized.includes('\\') ||
    !SAFE_STORAGE_PATH_RE.test(normalized)
  ) {
    throw new Error('Invalid storage object path.');
  }
  return normalized;
}

function assertCustomerId(customerId: string): string {
  if (!CUSTOMER_UUID_RE.test(customerId)) {
    throw new Error('Invalid customer id for storage path.');
  }
  return customerId;
}

function storagePathFromLegacyUrl(url: string): string | null {
  const markers = ['/object/public/receipts/', '/object/sign/receipts/', '/object/authenticated/receipts/'];
  for (const marker of markers) {
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const rest = url.slice(idx + marker.length);
      return decodeURIComponent(rest.split('?')[0] ?? '');
    }
  }
  return null;
}

/** Turn a stored path (or legacy public URL) into a short-lived signed URL. */
export async function resolveReceiptDisplayUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;

  const rawPath =
    stored.startsWith('http://') || stored.startsWith('https://')
      ? storagePathFromLegacyUrl(stored)
      : stored;

  if (!rawPath) {
    return stored.startsWith('http') ? stored : null;
  }

  // Validate allowlist, then strip '../' immediately before the SDK call (SAST).
  const validated = assertSafeStoragePath(rawPath);
  const path = validated.replaceAll('../', '').replaceAll('..\\', '');
  if (path.includes('../') || path.includes('..\\')) {
    throw new Error('Invalid storage object path.');
  }

  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

export async function uploadImageToStorage(
  localUri: string,
  folder: 'receipts' | 'signatures' | 'items',
  customerId: string,
): Promise<string> {
  const safeCustomerId = assertCustomerId(customerId);
  const extension = (localUri.split('.').pop()?.toLowerCase() ?? 'jpg').replace(/[^a-z0-9]/g, '');
  const safeExt = extension === 'png' || extension === 'jpg' || extension === 'jpeg' ? extension : 'jpg';
  // Build from validated UUID + fixed folder enum only; strip '../' before upload (SAST).
  const validatedPath = assertSafeStoragePath(
    `${safeCustomerId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`,
  );
  const objectPath = validatedPath.replaceAll('../', '').replaceAll('..\\', '');
  if (objectPath.includes('../') || objectPath.includes('..\\')) {
    throw new Error('Invalid storage object path.');
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const { error } = await supabase.storage.from('receipts').upload(objectPath, bytes, {
    contentType: safeExt === 'png' ? 'image/png' : 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return objectPath;
}

export async function uploadSignatureDataUrl(
  dataUrl: string,
  customerId: string,
): Promise<string> {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
  const fileUri = `${FileSystem.cacheDirectory}signature-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uploadImageToStorage(fileUri, 'signatures', customerId);
}

/**
 * Creates a confirmed account for a customer standing at the counter, so staff
 * never have to send them away to install the app first. Runs in an Edge
 * Function because it needs the service-role key; no SMS is sent, and the
 * customer signs in later with OTP on the same number.
 */
export async function createWalkInCustomer(
  phoneNumber: string,
  fullName: string,
  address: string,
  role: CounterCustomerRole = 'retail_customer',
): Promise<string> {
  const customerRole: CounterCustomerRole = role === 'merchant' ? 'merchant' : 'retail_customer';
  const accessToken = await requireUserAccessToken();
  const { data, error } = await supabase.functions.invoke<{
    customer_id?: string;
    created?: boolean;
    error?: string;
  }>('create-walkin-customer', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      phone_number: toE164India(phoneNumber),
      full_name: fullName,
      address,
      role: customerRole,
    },
  });

  if (error) {
    const payload = await readEdgeFunctionErrorBody(error);
    throw new Error(
      payload?.error?.trim() ||
        edgeFunctionErrorMessage(error, 'Could not register the customer.'),
    );
  }
  if (!data?.customer_id) {
    throw new Error(data?.error ?? 'Could not register the customer.');
  }

  return data.customer_id;
}

export async function findCustomerIdByPhone(phoneNumber: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_profile_by_phone', {
    p_phone: phoneNumber,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

async function loadShopDefaults(): Promise<ShopDefaults> {
  const { data, error } = await supabase.from('shop_defaults').select('*').eq('id', 1).single();
  if (error || !data) {
    throw new Error(error?.message ?? 'shop_defaults row missing');
  }
  return data as ShopDefaults;
}

/** Single place screens read shop defaults. Do not query id = 1 from a route. */
export async function fetchShopDefaults(): Promise<ShopDefaults> {
  return loadShopDefaults();
}

/** RLS-safe: customers cannot SELECT shop_defaults, so this is a DEFINER RPC. */
export async function fetchLoansConcealed(): Promise<boolean> {
  const { data, error } = await supabase.rpc('loans_are_concealed');
  if (error) {
    throw new Error(error.message);
  }
  return Boolean(data);
}

/** Owner-only. Staff/customers are refused in SQL, not in the client. */
export async function setLoansConcealed(concealed: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_loans_concealed', {
    p_concealed: concealed,
  });
  if (error) {
    throw new Error(error.message);
  }
  return Boolean(data);
}

/**
 * Loan row exists; item photos did not all land. Retry with
 * attachItemPhotos — do not call createLoanWithCustomer again (serial UNIQUE).
 */
export class LoanPhotosIncompleteError extends Error {
  readonly code = 'LOAN_PHOTOS_INCOMPLETE' as const;

  constructor(
    readonly loanId: string,
    readonly serialNumber: string,
    readonly customerId: string,
    readonly itemIds: string[],
    readonly nextIndex: number,
    cause?: unknown,
  ) {
    super(
      `Loan ${serialNumber} was created but item photos are incomplete. The loan exists; retry attaching photos instead of saving again.`,
      cause instanceof Error ? { cause } : undefined,
    );
    this.name = 'LoanPhotosIncompleteError';
  }
}

export type FindLoanBySerialRow = {
  loanId: string;
  serialNumber: string;
  status: LoanStatus;
  isArchived: boolean;
  customerName: string | null;
};

/**
 * Serial is already on the book (unique index). Retry is findLoanBySerial
 * / open the existing loan — do not create_loan again.
 */
export class SerialExistsError extends Error {
  readonly code = 'SERIAL_EXISTS' as const;

  constructor(
    readonly serialNumber: string,
    readonly existing: FindLoanBySerialRow | null = null,
    cause?: unknown,
  ) {
    super(`serial_exists: ${serialNumber}`, cause instanceof Error ? { cause } : undefined);
    this.name = 'SerialExistsError';
  }
}

function parseSerialExistsMessage(message: string): string | null {
  const prefix = 'serial_exists:';
  if (!message.startsWith(prefix)) {
    return null;
  }
  const serial = message.slice(prefix.length).trim();
  return serial.length > 0 ? serial : null;
}

function parseFindLoanBySerialRow(data: unknown): FindLoanBySerialRow | null {
  const row = (Array.isArray(data) ? data[0] : data) as {
    loan_id?: unknown;
    serial_number?: unknown;
    status?: unknown;
    is_archived?: unknown;
    customer_name?: unknown;
  } | null;
  if (!row || typeof row.loan_id !== 'string' || row.loan_id.length === 0) {
    return null;
  }
  if (typeof row.serial_number !== 'string') {
    return null;
  }
  if (
    row.status !== 'active' &&
    row.status !== 'redeemed' &&
    row.status !== 'closed' &&
    row.status !== 'defaulted'
  ) {
    return null;
  }
  if (typeof row.is_archived !== 'boolean') {
    return null;
  }
  if (row.customer_name != null && typeof row.customer_name !== 'string') {
    return null;
  }
  return {
    loanId: row.loan_id,
    serialNumber: row.serial_number,
    status: row.status,
    isArchived: row.is_archived,
    customerName: row.customer_name ?? null,
  };
}

/** Shop-only. Exact trimmed serial; includes archived and ended loans. */
export async function findLoanBySerial(serial: string): Promise<FindLoanBySerialRow | null> {
  const trimmed = serial.trim();
  if (trimmed === '') {
    return null;
  }
  const { data, error } = await supabase.rpc('find_loan_by_serial', { p_serial: trimmed });
  if (error) {
    throw new Error(error.message);
  }
  return parseFindLoanBySerialRow(data);
}

type CreateLoanRow = { loan_id: string; item_ids: string[] };

function parseCreateLoanResult(data: unknown): CreateLoanRow {
  const row = (Array.isArray(data) ? data[0] : data) as CreateLoanRow | null;
  if (!row || typeof row.loan_id !== 'string' || row.loan_id.length === 0) {
    throw new Error('Could not create the loan.');
  }
  if (!Array.isArray(row.item_ids) || row.item_ids.some((id) => typeof id !== 'string')) {
    throw new Error('Could not create the loan.');
  }
  return row;
}

/** Attach local item photos using ids returned by create_loan, in input order. */
export async function attachItemPhotos(input: {
  loanId: string;
  serialNumber: string;
  customerId: string;
  items: ScannerItemDraft[];
  itemIds: string[];
  fromIndex?: number;
}): Promise<void> {
  if (input.itemIds.length !== input.items.length) {
    throw new LoanPhotosIncompleteError(
      input.loanId,
      input.serialNumber,
      input.customerId,
      input.itemIds,
      input.fromIndex ?? 0,
    );
  }

  const start = input.fromIndex ?? 0;
  for (let index = start; index < input.items.length; index += 1) {
    const uri = input.items[index]?.localPhotoUri;
    const itemId = input.itemIds[index];
    if (!uri || !itemId) {
      continue;
    }
    try {
      const prepared = await prepareItemPhoto(uri);
      const storagePath = await uploadImageToStorage(prepared.uri, 'items', input.customerId);
      const { error: photoError } = await supabase.from('loan_item_photos').insert({
        loan_item_id: itemId,
        storage_path: storagePath,
      });
      if (photoError) {
        throw new Error(photoError.message);
      }
    } catch (cause) {
      throw new LoanPhotosIncompleteError(
        input.loanId,
        input.serialNumber,
        input.customerId,
        input.itemIds,
        index,
        cause,
      );
    }
  }
}

export type CreateLoanOutcome = {
  loanId: string;
  customerId: string;
  kycSaveFailed: boolean;
};

async function persistKycDraft(customerId: string, draft: KycDraft): Promise<void> {
  let path: string | null = null;
  if (draft.localPhotoUri && draft.idDocumentType !== 'aadhaar') {
    path = await uploadKycImage(draft.localPhotoUri, customerId, draft.idDocumentType);
  }
  let photoPath: string | null | undefined;
  if (draft.localCustomerPhotoUri) {
    photoPath = await uploadCustomerPhoto(draft.localCustomerPhotoUri, customerId);
  }
  await saveKycCapture({
    customerId,
    idDocumentType: draft.idDocumentType,
    idDocumentLast4: draft.idDocumentLast4,
    dateOfBirth: draft.dateOfBirth,
    guardianName: draft.guardianName,
    idDocumentPath: path,
    photoPath,
  });
}

export async function createLoanWithCustomer(
  form: LoanFormData,
  items: ScannerItemDraft[],
  receiptLocalUri: string | null,
  signatureDataUrl: string | null,
  kycDraft?: KycDraft | null,
  customerRole: CounterCustomerRole = 'retail_customer',
  options?: { idempotencyKey?: string },
): Promise<CreateLoanOutcome> {
  const selectedRole: CounterCustomerRole =
    customerRole === 'merchant' ? 'merchant' : 'retail_customer';

  // A walk-in customer no longer has to sign up before staff can write the
  // loan: if the number is unknown, register it at the counter and carry on.
  const customerId =
    (await findCustomerIdByPhone(form.phone_number)) ??
    (await createWalkInCustomer(
      form.phone_number,
      form.customer_name,
      form.address,
      selectedRole,
    ));

  const receiptPath = receiptLocalUri
    ? await uploadImageToStorage(receiptLocalUri, 'receipts', customerId)
    : null;
  const signaturePath = signatureDataUrl
    ? await uploadSignatureDataUrl(signatureDataUrl, customerId)
    : null;

  const principalPaise = rupeesInputToPaise(form.loan_amount_rupees);
  const defaults = await loadShopDefaults();

  const interestModel: InterestModel = selectedRole === 'merchant' ? 'merchant' : 'retail';

  const rateBps = form.interest_percent_monthly.trim()
    ? percentInputToBps(form.interest_percent_monthly)
    : interestModel === 'merchant'
      ? defaults.merchant_rate_bps
      : defaults.rate_bps;

  await supabase
    .from('profiles')
    .update({
      full_name: form.customer_name.trim() || null,
      address: form.address.trim() || null,
      phone_number: toE164India(form.phone_number),
      role: selectedRole,
    })
    .eq('id', customerId);

  let kycSaveFailed = false;
  if (kycDraft && kycDraftHasContent(kycDraft)) {
    try {
      await persistKycDraft(customerId, kycDraft);
    } catch {
      kycSaveFailed = true;
    }
  }

  const disbursedOn = form.disbursed_on.trim() || todayInKolkata();

  if (items.length < 1) {
    throw new Error('Add at least one pledged item.');
  }

  const converted = items.map((item) => convertScannerItem(item));
  const serialNumber = form.serial_number.trim();

  const { data, error } = await supabase.rpc('create_loan', {
    p_customer_id: customerId,
    p_serial_number: serialNumber,
    p_receipt_image_url: receiptPath,
    p_principal_paise: principalPaise,
    p_rate_bps: rateBps,
    p_disbursed_on: disbursedOn,
    p_interest_model: interestModel,
    p_digital_signature_url: signaturePath,
    p_items: converted as unknown as Json,
    p_idempotency_key: options?.idempotencyKey ?? newIdempotencyKey(),
  });

  if (error) {
    const taken = parseSerialExistsMessage(error.message);
    if (taken) {
      throw new SerialExistsError(taken);
    }
    throw new Error(error.message);
  }

  const created = parseCreateLoanResult(data);

  if (items.some((item) => item.localPhotoUri)) {
    await attachItemPhotos({
      loanId: created.loan_id,
      serialNumber,
      customerId,
      items,
      itemIds: created.item_ids,
    });
  }

  return {
    loanId: created.loan_id,
    customerId,
    kycSaveFailed,
  };
}

export async function fetchLoanBalances(
  loanId: string,
  asOf: string = todayInKolkata(),
): Promise<LoanBalances> {
  const { data, error } = await supabase.rpc('loan_balances_as_of', {
    p_loan_id: loanId,
    p_as_of: asOf,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('loan_balances_as_of returned no row');
  }

  return {
    accruedInterestPaise: asPaise(row.accrued_interest_paise),
    outstandingPrincipalPaise: asPaise(row.outstanding_principal_paise),
    totalDuePaise: asPaise(row.total_due_paise),
    interestPaidPaise: asPaise(row.interest_paid_paise),
    principalPaidPaise: asPaise(row.principal_paid_paise),
    overpaymentRefundedPaise: asPaise(row.overpayment_refunded_paise),
  };
}

export async function logPayment(
  loanId: string,
  amountPaidPaise: number,
  paidOn: string = todayInKolkata(),
  options?: { idempotencyKey?: string },
): Promise<void> {
  const paise = asPaise(amountPaidPaise);
  if (paise <= 0) {
    throw new Error('Payment amount must be greater than zero paise.');
  }

  const { error } = await supabase.rpc('log_payment', {
    p_loan_id: loanId,
    p_amount_paid_paise: paise,
    p_paid_on: paidOn,
    p_idempotency_key: options?.idempotencyKey ?? newIdempotencyKey(),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchLoanItems(loanId: string): Promise<LoanItem[]> {
  const { data, error } = await supabase
    .from('loan_items')
    .select('*')
    .eq('loan_id', loanId)
    .order('position', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LoanItem[];
}

/** Item stills in the private receipts bucket; signed URLs are created at display time. */
export async function fetchLoanItemPhotos(itemIds: string[]): Promise<LoanItemPhoto[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('loan_item_photos')
    .select('*')
    .in('loan_item_id', itemIds)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LoanItemPhoto[];
}

export async function fetchLatestMaturityOn(loanId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('loan_renewals')
    .select('new_maturity_on')
    .eq('loan_id', loanId)
    .order('renewed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.new_maturity_on ?? null;
}

/**
 * Owner-only redemption. Idempotent: a second call returns the original
 * snapshot and does not insert another payment. Replaces closeLoanIfFullyPaid,
 * which flipped status='closed' from the client and skipped the checklist.
 */
export async function redeemLoan(input: {
  loanId: string;
  redeemedOn: string;
  releasedToName: string;
  itemIds: string[];
  finalPaymentPaise: number;
  releaseNote?: string | null;
  releaseSignatureUrl?: string | null;
  idempotencyKey?: string;
}): Promise<RedeemLoanResult> {
  const { data, error } = await supabase.rpc('redeem_loan', {
    p_loan_id: input.loanId,
    p_redeemed_on: input.redeemedOn,
    p_released_to_name: input.releasedToName,
    p_item_ids: input.itemIds,
    p_final_payment_paise: asPaise(input.finalPaymentPaise),
    p_release_note: input.releaseNote ?? null,
    p_release_signature_url: input.releaseSignatureUrl ?? null,
    p_idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('redeem_loan returned no row');
  }

  return {
    loan_id: row.loan_id,
    status: row.status,
    redeemed_on: row.redeemed_on,
    redeemed_by: row.redeemed_by,
    closure_balance_paise: asPaise(row.closure_balance_paise),
    already_redeemed: row.already_redeemed,
  };
}

/**
 * Owner-only forfeiture. Idempotent: a second call returns the original
 * snapshot. Overdue-ness and the six-month rule are decided in SQL.
 */
export async function defaultLoan(input: {
  loanId: string;
  defaultedOn: string;
  reason: string;
}): Promise<DefaultLoanResult> {
  const { data, error } = await supabase.rpc('default_loan', {
    p_loan_id: input.loanId,
    p_defaulted_on: input.defaultedOn,
    p_reason: input.reason,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('default_loan returned no row');
  }

  return {
    loan_id: row.loan_id,
    status: row.status,
    defaulted_on: row.defaulted_on,
    defaulted_by: row.defaulted_by,
    default_balance_paise: asPaise(row.default_balance_paise),
    already_defaulted: row.already_defaulted,
  };
}

/**
 * Owner-only hide. Idempotent: a second call returns the original snapshot
 * and writes nothing. Never DELETE.
 */
export async function archiveLoan(input: {
  loanId: string;
  reason: string;
}): Promise<ArchiveLoanResult> {
  const { data, error } = await supabase.rpc('archive_loan', {
    p_loan_id: input.loanId,
    p_reason: input.reason,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('archive_loan returned no row');
  }

  return {
    loan_id: row.loan_id,
    archived_at: row.archived_at,
    archived_by: row.archived_by,
    archive_reason: row.archive_reason,
    archive_balance_paise: asPaise(row.archive_balance_paise),
    already_archived: row.already_archived,
  };
}

/**
 * Owner-only restore. Clears the four archive columns and writes an audit row.
 */
export async function unarchiveLoan(loanId: string): Promise<UnarchiveLoanResult> {
  const { data, error } = await supabase.rpc('unarchive_loan', {
    p_loan_id: loanId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('unarchive_loan returned no row');
  }

  return {
    loan_id: row.loan_id,
    unarchived: row.unarchived,
  };
}

/**
 * Owner-only. Turns a redeemed loan back to active and reverses the
 * closing payment so the owner can edit terms or collect again.
 */
export async function unredeemLoan(input: {
  loanId: string;
  reason: string;
}): Promise<UnredeemLoanResult> {
  const { data, error } = await supabase.rpc('unredeem_loan', {
    p_loan_id: input.loanId,
    p_reason: input.reason,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('unredeem_loan returned no row');
  }

  return {
    loan_id: row.loan_id,
    status: row.status,
    reversed_payment_id: row.reversed_payment_id ?? null,
  };
}

type ArchivedLoanQueryRow = {
  id: string;
  serial_number: string;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  archive_balance_paise: number | null;
  customer: { full_name: string | null } | { full_name: string | null }[] | null;
  archiver: { full_name: string | null } | { full_name: string | null }[] | null;
};

function nestedName(
  value: { full_name: string | null } | { full_name: string | null }[] | null,
): string | null {
  if (Array.isArray(value)) {
    return value[0]?.full_name ?? null;
  }
  return value?.full_name ?? null;
}

/**
 * Owner-only list. RLS hides archived rows from staff and customers; this
 * `.not('archived_at')` is UX so the Archive screen is not the live book.
 */
export async function fetchArchivedLoans(): Promise<ArchivedLoan[]> {
  const { data, error } = await supabase
    .from('loans')
    .select(
      `
      id,
      serial_number,
      archived_at,
      archived_by,
      archive_reason,
      archive_balance_paise,
      customer:customer_id ( full_name ),
      archiver:archived_by ( full_name )
    `,
    )
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as ArchivedLoanQueryRow[];
  return rows.flatMap((row) => {
    if (
      row.archived_at == null ||
      row.archived_by == null ||
      row.archive_reason == null ||
      row.archive_balance_paise == null
    ) {
      return [];
    }
    return [
      {
        id: row.id,
        serial_number: row.serial_number,
        archived_at: row.archived_at,
        archived_by: row.archived_by,
        archive_reason: row.archive_reason,
        archive_balance_paise: asPaise(row.archive_balance_paise),
        customer_name: nestedName(row.customer),
        archived_by_name: nestedName(row.archiver),
      },
    ];
  });
}

export async function updateShopDefaults(input: {
  rateBps: number;
  partialPeriodMode: PartialPeriodMode;
  roundUpThresholdDays: number;
  simplePeriodDays: number;
  compoundEveryDays: number;
  graceDays: number;
}): Promise<ShopDefaults> {
  const { data, error } = await supabase.rpc('update_shop_defaults', {
    p_rate_bps: input.rateBps,
    p_partial_period_mode: input.partialPeriodMode,
    p_round_up_threshold_days: input.roundUpThresholdDays,
    p_simple_period_days: input.simplePeriodDays,
    p_compound_every_days: input.compoundEveryDays,
    p_grace_days: input.graceDays,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('update_shop_defaults returned no row');
  }

  return data as ShopDefaults;
}

export async function editLoanTerms(input: {
  loanId: string;
  rateBps: number;
  interestModel: InterestModel;
  simplePeriodDays: number;
  compoundEveryDays: number;
  graceDays: number;
  partialPeriodMode: PartialPeriodMode;
  roundUpThresholdDays: number;
  reason: string;
}): Promise<EditLoanTermsResult> {
  const { data, error } = await supabase.rpc('edit_loan_terms', {
    p_loan_id: input.loanId,
    p_rate_bps: input.rateBps,
    p_interest_model: input.interestModel,
    p_simple_period_days: input.simplePeriodDays,
    p_compound_every_days: input.compoundEveryDays,
    p_grace_days: input.graceDays,
    p_partial_period_mode: input.partialPeriodMode,
    p_round_up_threshold_days: input.roundUpThresholdDays,
    p_reason: input.reason,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('edit_loan_terms returned no row');
  }

  return {
    loan_id: row.loan_id,
    change_count: Number(row.change_count),
  };
}

export async function renewLoan(input: {
  loanId: string;
  renewedOn: string;
  interestPaidPaise: number;
  newMaturityOn: string;
  note?: string | null;
  idempotencyKey?: string;
}): Promise<RenewLoanResult> {
  const { data, error } = await supabase.rpc('renew_loan', {
    p_loan_id: input.loanId,
    p_renewed_on: input.renewedOn,
    p_interest_paid_paise: asPaise(input.interestPaidPaise),
    p_new_maturity_on: input.newMaturityOn,
    p_note: input.note ?? null,
    p_idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('renew_loan returned no row');
  }

  return {
    renewal_id: row.renewal_id,
    loan_id: row.loan_id,
    renewed_on: row.renewed_on,
    interest_paid_paise: asPaise(row.interest_paid_paise),
    new_maturity_on: row.new_maturity_on,
    already_renewed: row.already_renewed,
  };
}

function coerceOverdueLoan(row: OverdueLoan): OverdueLoan {
  return {
    ...row,
    days_overdue: Number(row.days_overdue),
    outstanding_principal_paise: asPaise(row.outstanding_principal_paise),
    accrued_interest_paise: asPaise(row.accrued_interest_paise),
    total_due_paise: asPaise(row.total_due_paise),
  };
}

/** Overdue-ness is decided in SQL. The client must not compare dates. */
export async function fetchOverdueLoans(asOf?: string): Promise<OverdueLoan[]> {
  const { data, error } = await supabase.rpc(
    'loans_overdue_as_of',
    asOf ? { p_as_of: asOf } : {},
  );

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as OverdueLoan[]).map(coerceOverdueLoan);
}

/** Owner-only. Staff and customers get an empty list from the RPC. */
export async function fetchRateYield(): Promise<RateYield[]> {
  const { data, error } = await supabase.rpc('shop_rate_yield');

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RateYield[]).map((row) => ({
    rate_bps: Number(row.rate_bps),
    loan_count: Number(row.loan_count),
    principal_paise: asPaise(row.principal_paise),
    one_period_yield_paise: asPaise(row.one_period_yield_paise),
    six_period_yield_paise: asPaise(row.six_period_yield_paise),
    twelve_period_yield_paise: asPaise(row.twelve_period_yield_paise),
  }));
}

export async function generateLoanNotices(asOf?: string): Promise<number> {
  const { data, error } = await supabase.rpc(
    'generate_loan_notices',
    asOf ? { p_as_of: asOf } : {},
  );

  if (error) {
    throw new Error(error.message);
  }

  const n = typeof data === 'string' ? Number.parseInt(data, 10) : (data ?? 0);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`generate_loan_notices returned an invalid count: ${data}`);
  }
  return n;
}

export async function fetchLoanNotices(limit = 50): Promise<LoanNotice[]> {
  const { data, error } = await supabase
    .from('loan_notices')
    .select('*')
    .order('scheduled_for', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LoanNotice[];
}

export async function fetchCustomerLoanReminders(asOf?: string): Promise<LoanReminderSlot[]> {
  const { data, error } = await supabase.rpc('customer_loan_reminder_schedule', {
    p_as_of: asOf ?? todayInKolkata(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as LoanReminderSlot[]).filter((row) => isReminderKind(row.reminder_kind));
}

export async function fetchLoanCurrentDueOn(loanId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('loan_current_due_on', { p_loan_id: loanId });
  if (error) {
    throw new Error(error.message);
  }
  return data ?? null;
}

/** Signed-out loan QR landing — last 4 of serial only (SECURITY DEFINER RPC). */
export async function fetchLoanReceiptMaskByPublicToken(
  publicToken: string,
): Promise<string | null> {
  const token = publicToken.trim();
  if (!token) return null;

  const { data, error } = await supabase.rpc('loan_receipt_mask_by_public_token', {
    p_token: token,
  });
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as { serial_last4: string }[];
  const last4 = rows[0]?.serial_last4;
  return last4 && last4.length > 0 ? last4 : null;
}

/**
 * Signed-in loan QR resolve. RLS is the boundary — empty means not yours / missing,
 * never "belongs to someone else".
 */
export async function fetchOwnLoanIdByPublicToken(publicToken: string): Promise<string | null> {
  const token = publicToken.trim();
  if (!token) return null;

  const { data, error } = await supabase
    .from('loans')
    .select('id')
    .eq('public_token', token)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}
