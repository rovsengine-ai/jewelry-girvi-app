import * as FileSystem from 'expo-file-system/legacy';

import {
  asPaise,
  percentInputToBps,
  rupeesInputToPaise,
  todayInKolkata,
} from '@/lib/money';
import { toE164India } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import type { InterestModel, LoanBalances, LoanFormData, ShopDefaults } from '@/types/database';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const CUSTOMER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_STORAGE_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(receipts|signatures)\/[A-Za-z0-9._-]+$/i;

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
  folder: 'receipts' | 'signatures',
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
  receiptLocalUri: string,
  signatureDataUrl: string | null,
): Promise<string> {
  const customerId = await findCustomerIdByPhone(form.phone_number);
  if (!customerId) {
    throw new Error(
      'No registered customer found for this phone number. Ask the customer to sign up via OTP first, then retry.',
    );
  }

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

  const { data, error } = await supabase
    .from('loans')
    .insert({
      customer_id: customerId,
      serial_number: form.serial_number.trim(),
      receipt_image_url: receiptPath,
      item_name: form.item_name.trim(),
      weight_grams: Number(form.weight_grams),
      principal_paise: principalPaise,
      rate_bps: rateBps,
      disbursed_on: disbursedOn,
      interest_model: interestModel,
      simple_period_days: defaults.simple_period_days,
      compound_every_days: defaults.compound_every_days,
      grace_days: defaults.grace_days,
      partial_period_mode: defaults.partial_period_mode,
      status: 'active',
      digital_signature_url: signaturePath,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
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

/** Owner-only: close when balances are cleared. Staff must not call this. */
export async function closeLoanIfFullyPaid(loanId: string, asOf: string = todayInKolkata()): Promise<void> {
  const balances = await fetchLoanBalances(loanId, asOf);
  if (balances.outstandingPrincipalPaise > 0 || balances.accruedInterestPaise > 0) {
    return;
  }

  const { error } = await supabase.from('loans').update({ status: 'closed' }).eq('id', loanId);
  if (error) {
    throw new Error(error.message);
  }
}
