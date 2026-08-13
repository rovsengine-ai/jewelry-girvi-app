export type UserRole = 'admin' | 'retail_customer' | 'merchant';

export type LoanStatus = 'active' | 'closed';

export type PaymentType = 'interest' | 'principal';

export interface Profile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  address: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Loan {
  id: string;
  customer_id: string;
  serial_number: string;
  receipt_image_url: string | null;
  item_name: string;
  weight_grams: number;
  loan_amount: number;
  interest_rate_monthly: number;
  status: LoanStatus;
  digital_signature_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoanWithCustomer extends Loan {
  profiles: Pick<Profile, 'full_name' | 'phone_number' | 'address' | 'role'> | null;
}

export interface Payment {
  id: string;
  loan_id: string;
  amount_paid: number;
  payment_type: PaymentType;
  created_at: string;
}

export interface OcrExtractionResult {
  serial_number: string;
  date: string;
  customer_name: string;
  phone_number: string;
  address: string;
  item_name: string;
  weight_grams: number;
  loan_amount: number;
  interest_rate: number;
}

export interface LoanFormData {
  serial_number: string;
  customer_name: string;
  phone_number: string;
  address: string;
  item_name: string;
  weight_grams: string;
  loan_amount: string;
  interest_rate_monthly: string;
}

export interface LoanBalances {
  principalPaid: number;
  interestPaid: number;
  remainingPrincipal: number;
  accruedInterestEstimate: number;
}
