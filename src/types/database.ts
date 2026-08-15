export type UserRole = 'owner' | 'staff' | 'retail_customer' | 'merchant';

/**
 * Mirrors the public.loan_status enum. `closed` predates the redemption audit
 * columns and means "ended, details unknown"; `redeemed` is only ever written
 * with redeemed_on and closure_balance_paise alongside it.
 */
export type LoanStatus = 'active' | 'redeemed' | 'closed' | 'defaulted';

export type InterestModel = 'retail' | 'merchant';

export type PartialPeriodMode = 'pro_rata' | 'full_period' | 'min_month_then_pro_rata';

export type Metal = 'gold' | 'silver';
export type PledgeMetal = Metal;

export type IdDocumentType = 'aadhaar' | 'pan' | 'voter_id' | 'driving_licence' | 'passport';

export type NoticeType = 'due_soon' | 'overdue' | 'renewal_offer' | 'forfeiture_warning';

export type NoticeChannel = 'sms' | 'whatsapp' | 'in_app';

export type NoticeDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'skipped';

/** Live feed or owner override. Never IBJA. */
export type GoldRateSource = 'goldapi' | 'metals_dev' | 'manual';

export interface GoldRate {
  id: string;
  quoted_on: string;
  purity_millesimal: number;
  source: GoldRateSource;
  price_per_10g_paise: number;
  fetched_at: string;
  created_by: string | null;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  address: string | null;
  role: UserRole;
  date_of_birth: string | null;
  id_document_type: IdDocumentType | null;
  /** Last 4 characters only. The full number is never stored. */
  id_document_last4: string | null;
  /**
   * Object path in the private `kyc` bucket, namespaced `{customer_id}/...`.
   * Always null when id_document_type is 'aadhaar': an unmasked Aadhaar image
   * is the full number, which UIDAI forbids storing. Enforced by a CHECK.
   */
  id_document_path: string | null;
  kyc_verified_on: string | null;
  kyc_verified_by: string | null;
  guardian_name: string | null;
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
  /** Remainder days at or past this threshold round up to a whole month. */
  round_up_threshold_days: number;
  updated_at: string;
}

export interface Loan {
  id: string;
  customer_id: string;
  serial_number: string;
  receipt_image_url: string | null;
  /** @deprecated Superseded by LoanItem. Still read by the admin UI. */
  item_name: string;
  /** @deprecated Use LoanItem.gross_weight_mg / net_weight_mg (integer mg). */
  weight_grams: number;
  principal_paise: number;
  rate_bps: number;
  disbursed_on: string;
  interest_model: InterestModel;
  simple_period_days: number;
  compound_every_days: number;
  grace_days: number;
  partial_period_mode: PartialPeriodMode;
  round_up_threshold_days: number;
  status: LoanStatus;
  redeemed_on: string | null;
  redeemed_by: string | null;
  released_to_name: string | null;
  release_note: string | null;
  /**
   * Total due at the moment of redemption. Immutable audit figure: a later rate
   * or term edit must never be able to rewrite what was actually collected.
   */
  closure_balance_paise: number | null;
  digital_signature_url: string | null;
  release_signature_url: string | null;
  defaulted_on: string | null;
  defaulted_by: string | null;
  default_balance_paise: number | null;
  default_reason: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  archive_balance_paise: number | null;
  created_at: string;
  updated_at: string;
}

export interface RedeemLoanResult {
  loan_id: string;
  status: LoanStatus;
  redeemed_on: string;
  redeemed_by: string;
  closure_balance_paise: number;
  already_redeemed: boolean;
}

export interface RenewLoanResult {
  renewal_id: string;
  loan_id: string;
  renewed_on: string;
  interest_paid_paise: number;
  new_maturity_on: string;
  already_renewed: boolean;
}

export interface DefaultLoanResult {
  loan_id: string;
  status: LoanStatus;
  defaulted_on: string;
  defaulted_by: string;
  default_balance_paise: number;
  already_defaulted: boolean;
}

export interface EditLoanTermsResult {
  loan_id: string;
  change_count: number;
}

export interface ArchiveLoanResult {
  loan_id: string;
  archived_at: string;
  archived_by: string;
  archive_reason: string;
  archive_balance_paise: number;
  already_archived: boolean;
}

export interface UnarchiveLoanResult {
  loan_id: string;
  unarchived: boolean;
}

export interface ArchivedLoan {
  id: string;
  serial_number: string;
  archived_at: string;
  archived_by: string;
  archive_reason: string;
  archive_balance_paise: number;
  customer_name: string | null;
  archived_by_name: string | null;
}

export interface LoanWithCustomer extends Loan {
  profiles: Pick<
    Profile,
    | 'full_name'
    | 'phone_number'
    | 'address'
    | 'role'
    | 'id_document_type'
    | 'kyc_verified_on'
    | 'guardian_name'
  > | null;
}

export interface Payment {
  id: string;
  loan_id: string;
  amount_paid_paise: number;
  paid_on: string;
  created_at: string;
}

/** Weights are integer MILLIGRAMS, mirroring the paise/bps discipline. */
export interface LoanItem {
  id: string;
  loan_id: string;
  /** 1-based order from the create_loan items array. Unique per loan. */
  position: number;
  ornament_type: string;
  description: string | null;
  /** null only on rows that predate the metal column. New loans require gold or silver. */
  metal: Metal | null;
  gross_weight_mg: number;
  net_weight_mg: number;
  /** null means not assessed. Never default this to 22. */
  purity_karat: number | null;
  stone_deduction_mg: number;
  quantity: number;
  valuation_paise: number | null;
  /** Rate row frozen into valuation_paise. Null when unvalued. */
  gold_rate_id: string | null;
  created_at: string;
}

export interface LoanItemPhoto {
  id: string;
  loan_item_id: string;
  /** `{customer_id}/items/{filename}` in the private `receipts` bucket. */
  storage_path: string;
  caption: string | null;
  created_at: string;
}

export interface LoanRenewal {
  id: string;
  loan_id: string;
  renewed_on: string;
  renewed_by: string;
  interest_paid_paise: number;
  new_maturity_on: string;
  note: string | null;
  created_at: string;
}

export interface LoanNotice {
  id: string;
  loan_id: string;
  notice_type: NoticeType;
  scheduled_for: string;
  sent_at: string | null;
  channel: NoticeChannel;
  delivery_status: NoticeDeliveryStatus;
  provider_message_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/** One row of public.loans_overdue_as_of(). Overdue-ness is decided in SQL. */
export interface OverdueLoan {
  loan_id: string;
  customer_id: string;
  serial_number: string;
  disbursed_on: string;
  due_on: string;
  days_overdue: number;
  outstanding_principal_paise: number;
  accrued_interest_paise: number;
  total_due_paise: number;
  customer_name: string | null;
  phone_number: string | null;
}

/** One row of public.shop_rate_yield(). Owner-only; empty for staff. */
export interface RateYield {
  rate_bps: number;
  loan_count: number;
  principal_paise: number;
  one_period_yield_paise: number;
  six_period_yield_paise: number;
  twelve_period_yield_paise: number;
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

/** Form fields are display strings; convert to paise/bps/mg on save. */
export interface LoanFormData {
  serial_number: string;
  customer_name: string;
  phone_number: string;
  address: string;
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
