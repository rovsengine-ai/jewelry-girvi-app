export type UserRole = 'owner' | 'staff' | 'retail_customer' | 'merchant';

export type LoanStatus = 'active' | 'closed';

export type InterestModel = 'retail' | 'merchant';

export type PartialPeriodMode = 'pro_rata' | 'full_period';

export interface Profile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  address: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface ShopDefaults {
  id: number;
  interest_model: InterestModel;
  rate_bps: number;
  merchant_rate_bps: number;
  simple_period_days: number;
  compound_every_days: number;
  grace_days: number;
  partial_period_mode: PartialPeriodMode;
  updated_at: string;
}

export interface Loan {
  id: string;
  customer_id: string;
  serial_number: string;
  receipt_image_url: string | null;
  item_name: string;
  weight_grams: number;
  principal_paise: number;
  rate_bps: number;
  disbursed_on: string;
  interest_model: InterestModel;
  simple_period_days: number;
  compound_every_days: number;
  grace_days: number;
  partial_period_mode: PartialPeriodMode;
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
  amount_paid_paise: number;
  paid_on: string;
  created_at: string;
}

export interface LoanTermChange {
  id: string;
  loan_id: string;
  changed_by: string;
  changed_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
}

export interface OcrExtractionResult {
  serial_number: string;
  date: string;
  customer_name: string;
  phone_number: string;
  address: string;
  item_name: string;
  weight_grams: number;
  /** Rupees from OCR — convert to paise at the form/save boundary. */
  loan_amount: number;
  /** Monthly percent from OCR — convert to basis points at the form/save boundary. */
  interest_rate: number;
}

/** Form fields are display strings; convert to paise/bps on save. */
export interface LoanFormData {
  serial_number: string;
  customer_name: string;
  phone_number: string;
  address: string;
  item_name: string;
  weight_grams: string;
  loan_amount_rupees: string;
  interest_percent_monthly: string;
  disbursed_on: string;
}

export interface LoanBalances {
  accruedInterestPaise: number;
  outstandingPrincipalPaise: number;
  totalDuePaise: number;
  interestPaidPaise: number;
  principalPaidPaise: number;
  overpaymentRefundedPaise: number;
}
