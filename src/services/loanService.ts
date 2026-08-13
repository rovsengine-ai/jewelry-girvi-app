import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/lib/supabase';
import type { LoanBalances, LoanFormData, PaymentType } from '@/types/database';

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/^0+/, '');
}

export async function uploadImageToStorage(
  localUri: string,
  folder: 'receipts' | 'signatures',
): Promise<string> {
  const extension = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const { error } = await supabase.storage.from('receipts').upload(fileName, bytes, {
    contentType: extension === 'png' ? 'image/png' : 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
  return data.publicUrl;
}

export async function findCustomerIdByPhone(phoneNumber: string): Promise<string | null> {
  const normalized = normalizePhone(phoneNumber);

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

export async function createLoanWithCustomer(
  form: LoanFormData,
  receiptImageUrl: string,
  signatureImageUrl: string | null,
): Promise<string> {
  const customerId = await findCustomerIdByPhone(form.phone_number);
  if (!customerId) {
    throw new Error(
      'No registered customer found for this phone number. Ask the customer to sign up via OTP first, then retry.',
    );
  }

  await supabase
    .from('profiles')
    .update({
      full_name: form.customer_name.trim() || null,
      address: form.address.trim() || null,
    })
    .eq('id', customerId);

  const { data, error } = await supabase
    .from('loans')
    .insert({
      customer_id: customerId,
      serial_number: form.serial_number.trim(),
      receipt_image_url: receiptImageUrl,
      item_name: form.item_name.trim(),
      weight_grams: Number(form.weight_grams),
      loan_amount: Number(form.loan_amount),
      interest_rate_monthly: Number(form.interest_rate_monthly),
      status: 'active',
      digital_signature_url: signatureImageUrl,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
}

export function calculateLoanBalances(
  loanAmount: number,
  interestRateMonthly: number,
  payments: Array<{ amount_paid: number; payment_type: PaymentType }>,
  createdAt: string,
): LoanBalances {
  const principalPaid = payments
    .filter((p) => p.payment_type === 'principal')
    .reduce((sum, p) => sum + Number(p.amount_paid), 0);

  const interestPaid = payments
    .filter((p) => p.payment_type === 'interest')
    .reduce((sum, p) => sum + Number(p.amount_paid), 0);

  const remainingPrincipal = Math.max(loanAmount - principalPaid, 0);

  const start = new Date(createdAt);
  const now = new Date();
  const monthsElapsed = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()),
  );

  const accruedInterestEstimate = Math.max(
    remainingPrincipal * (interestRateMonthly / 100) * monthsElapsed - interestPaid,
    0,
  );

  return {
    principalPaid,
    interestPaid,
    remainingPrincipal,
    accruedInterestEstimate: Math.round(accruedInterestEstimate * 100) / 100,
  };
}

export async function logPayment(
  loanId: string,
  amountPaid: number,
  paymentType: PaymentType,
): Promise<void> {
  const { error } = await supabase.from('payments').insert({
    loan_id: loanId,
    amount_paid: amountPaid,
    payment_type: paymentType,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function closeLoanIfFullyPaid(loanId: string, remainingPrincipal: number): Promise<void> {
  if (remainingPrincipal > 0) {
    return;
  }

  const { error } = await supabase.from('loans').update({ status: 'closed' }).eq('id', loanId);
  if (error) {
    throw new Error(error.message);
  }
}
