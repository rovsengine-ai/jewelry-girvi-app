import * as FileSystem from 'expo-file-system/legacy';

import { isReminderKind, type LoanReminderSlot } from '@/lib/loan-reminders';
import { asPaise, percentInputToBps, rupeesInputToPaise, todayInKolkata } from '@/lib/money';
import { toE164India } from '@/lib/phone';
import { convertScannerItem, type ScannerItemDraft } from '@/lib/scanner-items';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/supabase';
import type {
  InterestModel,
  LoanBalances,
  LoanFormData,
  LoanItem,
  LoanNotice,
  OverdueLoan,
  RateYield,
  RedeemLoanResult,
  RenewLoanResult,
  ShopDefaults,
} from '@/types/database';

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
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    customer_id?: string;
    created?: boolean;
    error?: string;
  }>('create-walkin-customer', {
    body: {
      phone_number: toE164India(phoneNumber),
      full_name: fullName,
      address,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.customer_id) {
    throw new Error(data?.error ?? 'Could not register the customer.');
  }

  return data.customer_id;
}

export async function findCustomerIdByPhone(phoneNumber: string): Promise<string | null> {
  const normalized = toE164India(phoneNumber);

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone_number', normalized)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

async function loadShopDefaults(): Promise<ShopDefaults> {
  const { data, error } = await supabase.from('shop_defaults').select('*').eq('id', 1).single();
  if (error || !data) {
    throw new Error(error?.message ?? 'shop_defaults row missing');
  }
  return data as ShopDefaults;
}

export async function createLoanWithCustomer(
  form: LoanFormData,
  items: ScannerItemDraft[],
  receiptLocalUri: string,
  signatureDataUrl: string | null,
): Promise<string> {
  // A walk-in customer no longer has to sign up before staff can write the
  // loan: if the number is unknown, register it at the counter and carry on.
  const customerId =
    (await findCustomerIdByPhone(form.phone_number)) ??
    (await createWalkInCustomer(form.phone_number, form.customer_name, form.address));

  const receiptPath = await uploadImageToStorage(receiptLocalUri, 'receipts', customerId);
  const signaturePath = signatureDataUrl
    ? await uploadSignatureDataUrl(signatureDataUrl, customerId)
    : null;

  const principalPaise = rupeesInputToPaise(form.loan_amount_rupees);
  const defaults = await loadShopDefaults();

  const { data: customerProfile, error: profileReadError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', customerId)
    .single();

  if (profileReadError) {
    throw new Error(profileReadError.message);
  }

  const interestModel: InterestModel =
    customerProfile.role === 'merchant' ? 'merchant' : 'retail';

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
    })
    .eq('id', customerId);

  const disbursedOn = form.disbursed_on.trim() || todayInKolkata();

  if (items.length < 1) {
    throw new Error('Add at least one pledged item.');
  }

  const converted = items.map((item) => convertScannerItem(item));

  const { data, error } = await supabase.rpc('create_loan', {
    p_customer_id: customerId,
    p_serial_number: form.serial_number.trim(),
    p_receipt_image_url: receiptPath,
    p_principal_paise: principalPaise,
    p_rate_bps: rateBps,
    p_disbursed_on: disbursedOn,
    p_interest_model: interestModel,
    p_digital_signature_url: signaturePath,
    p_items: converted as unknown as Json,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('Could not create the loan.');
  }

  const createdItems = items.some((item) => item.localPhotoUri)
    ? await fetchLoanItems(data)
    : [];
  if (items.some((item) => item.localPhotoUri) && createdItems.length !== items.length) {
    throw new Error('Loan was created but pledged items could not be matched for photos.');
  }
  for (let index = 0; index < items.length; index += 1) {
    const uri = items[index]?.localPhotoUri;
    const itemId = createdItems[index]?.id;
    if (!uri || !itemId) {
      continue;
    }
    const storagePath = await uploadImageToStorage(uri, 'items', customerId);
    const { error: photoError } = await supabase.from('loan_item_photos').insert({
      loan_item_id: itemId,
      storage_path: storagePath,
    });
    if (photoError) {
      throw new Error(photoError.message);
    }
  }

  return data;
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
): Promise<void> {
  const paise = asPaise(amountPaidPaise);
  if (paise <= 0) {
    throw new Error('Payment amount must be greater than zero paise.');
  }

  const { error } = await supabase.from('payments').insert({
    loan_id: loanId,
    amount_paid_paise: paise,
    paid_on: paidOn,
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
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LoanItem[];
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
}): Promise<RedeemLoanResult> {
  const { data, error } = await supabase.rpc('redeem_loan', {
    p_loan_id: input.loanId,
    p_redeemed_on: input.redeemedOn,
    p_released_to_name: input.releasedToName,
    p_item_ids: input.itemIds,
    p_final_payment_paise: asPaise(input.finalPaymentPaise),
    p_release_note: input.releaseNote ?? null,
    p_release_signature_url: input.releaseSignatureUrl ?? null,
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

export async function renewLoan(input: {
  loanId: string;
  renewedOn: string;
  interestPaidPaise: number;
  newMaturityOn: string;
  note?: string | null;
}): Promise<RenewLoanResult> {
  const { data, error } = await supabase.rpc('renew_loan', {
    p_loan_id: input.loanId,
    p_renewed_on: input.renewedOn,
    p_interest_paid_paise: asPaise(input.interestPaidPaise),
    p_new_maturity_on: input.newMaturityOn,
    p_note: input.note ?? null,
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
  const { data, error } = await supabase.rpc(
    'customer_loan_reminder_schedule',
    asOf ? { p_as_of: asOf } : {},
  );

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
