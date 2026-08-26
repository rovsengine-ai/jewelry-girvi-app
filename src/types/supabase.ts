import type {
  IdDocumentType,
  InterestModel,
  LoanStatus,
  NoticeChannel,
  NoticeDeliveryStatus,
  NoticeType,
  PartialPeriodMode,
  UserRole,
} from './database';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone_number: string | null;
          address: string | null;
          role: UserRole;
          date_of_birth: string | null;
          id_document_type: IdDocumentType | null;
          id_document_last4: string | null;
          id_document_path: string | null;
          photo_path: string | null;
          kyc_verified_on: string | null;
          kyc_verified_by: string | null;
          guardian_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone_number?: string | null;
          address?: string | null;
          role?: UserRole;
          date_of_birth?: string | null;
          id_document_type?: IdDocumentType | null;
          id_document_last4?: string | null;
          id_document_path?: string | null;
          photo_path?: string | null;
          kyc_verified_on?: string | null;
          kyc_verified_by?: string | null;
          guardian_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          phone_number?: string | null;
          address?: string | null;
          role?: UserRole;
          date_of_birth?: string | null;
          id_document_type?: IdDocumentType | null;
          id_document_last4?: string | null;
          id_document_path?: string | null;
          photo_path?: string | null;
          kyc_verified_on?: string | null;
          kyc_verified_by?: string | null;
          guardian_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shop_defaults: {
        Row: {
          id: number;
          interest_model: InterestModel;
          rate_bps: number;
          merchant_rate_bps: number;
          simple_period_days: number;
          compound_every_days: number;
          grace_days: number;
          partial_period_mode: PartialPeriodMode;
          round_up_threshold_days: number;
          loans_concealed: boolean;
          updated_at: string;
        };
        Insert: {
          id?: number;
          interest_model?: InterestModel;
          rate_bps?: number;
          merchant_rate_bps?: number;
          simple_period_days?: number;
          compound_every_days?: number;
          grace_days?: number;
          partial_period_mode?: PartialPeriodMode;
          round_up_threshold_days?: number;
          loans_concealed?: boolean;
          updated_at?: string;
        };
        Update: {
          interest_model?: InterestModel;
          rate_bps?: number;
          merchant_rate_bps?: number;
          simple_period_days?: number;
          compound_every_days?: number;
          grace_days?: number;
          partial_period_mode?: PartialPeriodMode;
          round_up_threshold_days?: number;
          loans_concealed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      loans: {
        Row: {
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
          round_up_threshold_days: number;
          status: LoanStatus;
          redeemed_on: string | null;
          redeemed_by: string | null;
          released_to_name: string | null;
          release_note: string | null;
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
          public_token: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          serial_number: string;
          receipt_image_url?: string | null;
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
          round_up_threshold_days?: number;
          status?: LoanStatus;
          redeemed_on?: string | null;
          redeemed_by?: string | null;
          released_to_name?: string | null;
          release_note?: string | null;
          closure_balance_paise?: number | null;
          digital_signature_url?: string | null;
          release_signature_url?: string | null;
          defaulted_on?: string | null;
          defaulted_by?: string | null;
          default_balance_paise?: number | null;
          default_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          archive_reason?: string | null;
          archive_balance_paise?: number | null;
          created_at?: string;
          updated_at?: string;
          public_token?: string;
        };
        Update: {
          customer_id?: string;
          serial_number?: string;
          receipt_image_url?: string | null;
          item_name?: string;
          weight_grams?: number;
          principal_paise?: number;
          rate_bps?: number;
          disbursed_on?: string;
          interest_model?: InterestModel;
          simple_period_days?: number;
          compound_every_days?: number;
          grace_days?: number;
          partial_period_mode?: PartialPeriodMode;
          round_up_threshold_days?: number;
          status?: LoanStatus;
          redeemed_on?: string | null;
          redeemed_by?: string | null;
          released_to_name?: string | null;
          release_note?: string | null;
          closure_balance_paise?: number | null;
          digital_signature_url?: string | null;
          release_signature_url?: string | null;
          defaulted_on?: string | null;
          defaulted_by?: string | null;
          default_balance_paise?: number | null;
          default_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          archive_reason?: string | null;
          archive_balance_paise?: number | null;
          created_at?: string;
          updated_at?: string;
          public_token?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'loans_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'loans_archived_by_fkey';
            columns: ['archived_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          loan_id: string;
          amount_paid_paise: number;
          paid_on: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          loan_id: string;
          amount_paid_paise: number;
          paid_on: string;
          created_at?: string;
        };
        Update: {
          loan_id?: string;
          amount_paid_paise?: number;
          paid_on?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_loan_id_fkey';
            columns: ['loan_id'];
            isOneToOne: false;
            referencedRelation: 'loans';
            referencedColumns: ['id'];
          },
        ];
      };
      loan_items: {
        Row: {
          id: string;
          loan_id: string;
          position: number;
          ornament_type: string;
          description: string | null;
          metal: 'gold' | 'silver' | null;
          gross_weight_mg: number;
          net_weight_mg: number;
          purity_karat: number | null;
          stone_deduction_mg: number;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          loan_id: string;
          position: number;
          ornament_type: string;
          description?: string | null;
          metal?: 'gold' | 'silver' | null;
          gross_weight_mg: number;
          net_weight_mg: number;
          purity_karat?: number | null;
          stone_deduction_mg?: number;
          quantity?: number;
          created_at?: string;
        };
        Update: {
          loan_id?: string;
          position?: number;
          ornament_type?: string;
          description?: string | null;
          metal?: 'gold' | 'silver' | null;
          gross_weight_mg?: number;
          net_weight_mg?: number;
          purity_karat?: number | null;
          stone_deduction_mg?: number;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'loan_items_loan_id_fkey';
            columns: ['loan_id'];
            isOneToOne: false;
            referencedRelation: 'loans';
            referencedColumns: ['id'];
          },
        ];
      };
      loan_item_photos: {
        Row: {
          id: string;
          loan_item_id: string;
          storage_path: string;
          caption: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          loan_item_id: string;
          storage_path: string;
          caption?: string | null;
          created_at?: string;
        };
        Update: {
          loan_item_id?: string;
          storage_path?: string;
          caption?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'loan_item_photos_loan_item_id_fkey';
            columns: ['loan_item_id'];
            isOneToOne: false;
            referencedRelation: 'loan_items';
            referencedColumns: ['id'];
          },
        ];
      };
      loan_renewals: {
        Row: {
          id: string;
          loan_id: string;
          renewed_on: string;
          renewed_by: string;
          interest_paid_paise: number;
          new_maturity_on: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          loan_id: string;
          renewed_on?: string;
          renewed_by: string;
          interest_paid_paise: number;
          new_maturity_on: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          loan_id?: string;
          renewed_on?: string;
          renewed_by?: string;
          interest_paid_paise?: number;
          new_maturity_on?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'loan_renewals_loan_id_fkey';
            columns: ['loan_id'];
            isOneToOne: false;
            referencedRelation: 'loans';
            referencedColumns: ['id'];
          },
        ];
      };
      loan_notices: {
        Row: {
          id: string;
          loan_id: string;
          notice_type: NoticeType;
          scheduled_for: string;
          sent_at: string | null;
          channel: NoticeChannel;
          delivery_status: NoticeDeliveryStatus;
          provider_message_id: string | null;
          push_sent_at: string | null;
          push_ticket_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          loan_id: string;
          notice_type: NoticeType;
          scheduled_for: string;
          sent_at?: string | null;
          channel?: NoticeChannel;
          delivery_status?: NoticeDeliveryStatus;
          provider_message_id?: string | null;
          push_sent_at?: string | null;
          push_ticket_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          loan_id?: string;
          notice_type?: NoticeType;
          scheduled_for?: string;
          sent_at?: string | null;
          channel?: NoticeChannel;
          delivery_status?: NoticeDeliveryStatus;
          provider_message_id?: string | null;
          push_sent_at?: string | null;
          push_ticket_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'loan_notices_loan_id_fkey';
            columns: ['loan_id'];
            isOneToOne: false;
            referencedRelation: 'loans';
            referencedColumns: ['id'];
          },
        ];
      };
      profile_push_tokens: {
        Row: {
          id: string;
          profile_id: string;
          expo_push_token: string;
          platform: 'ios' | 'android';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          expo_push_token: string;
          platform: 'ios' | 'android';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          profile_id?: string;
          expo_push_token?: string;
          platform?: 'ios' | 'android';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_push_tokens_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      loan_term_changes: {
        Row: {
          id: string;
          loan_id: string;
          changed_by: string;
          changed_at: string;
          field: string;
          old_value: string | null;
          new_value: string | null;
          reason: string;
        };
        Insert: {
          id?: string;
          loan_id: string;
          changed_by: string;
          changed_at?: string;
          field: string;
          old_value?: string | null;
          new_value?: string | null;
          reason: string;
        };
        Update: {
          loan_id?: string;
          changed_by?: string;
          changed_at?: string;
          field?: string;
          old_value?: string | null;
          new_value?: string | null;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'loan_term_changes_loan_id_fkey';
            columns: ['loan_id'];
            isOneToOne: false;
            referencedRelation: 'loans';
            referencedColumns: ['id'];
          },
        ];
      };
      loan_unredeem_events: {
        Row: {
          id: string;
          loan_id: string;
          acted_by: string;
          reason: string;
          previous_redeemed_on: string;
          previous_closure_balance_paise: number;
          reversed_payment_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          loan_id: string;
          acted_by: string;
          reason: string;
          previous_redeemed_on: string;
          previous_closure_balance_paise: number;
          reversed_payment_id?: string | null;
          created_at?: string;
        };
        Update: {
          loan_id?: string;
          acted_by?: string;
          reason?: string;
          previous_redeemed_on?: string;
          previous_closure_balance_paise?: number;
          reversed_payment_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'loan_unredeem_events_loan_id_fkey';
            columns: ['loan_id'];
            isOneToOne: false;
            referencedRelation: 'loans';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      find_profile_by_phone: {
        Args: { p_phone: string };
        Returns: string | null;
      };
      find_loan_by_serial: {
        Args: { p_serial: string };
        Returns: {
          loan_id: string;
          serial_number: string;
          status: LoanStatus;
          is_archived: boolean;
          customer_name: string | null;
        }[];
      };
      is_shop_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_owner: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      loan_balances_as_of: {
        Args: { p_loan_id: string; p_as_of?: string };
        Returns: {
          accrued_interest_paise: number;
          outstanding_principal_paise: number;
          total_due_paise: number;
          interest_paid_paise: number;
          principal_paid_paise: number;
          overpayment_refunded_paise: number;
        }[];
      };
      quote_loan_payoff: {
        Args: {
          p_principal_paise: number;
          p_disbursed_on: string;
          p_as_of?: string;
          p_interest_model?: InterestModel | null;
        };
        Returns: {
          principal_paise: number;
          accrued_interest_paise: number;
          total_due_paise: number;
          days_elapsed: number;
          complete_periods: number;
          remainder_days: number;
          remainder_rounded_up: boolean;
          first_month_floor_applied: boolean;
          capitalized: boolean;
          period_interest_paise: number;
          rate_bps: number;
          interest_model: InterestModel;
          partial_period_mode: PartialPeriodMode;
          round_up_threshold_days: number;
          simple_period_days: number;
          disbursed_on: string;
          as_of: string;
          why_code: string;
        }[];
      };
      loans_overdue_as_of: {
        Args: { p_as_of?: string };
        Returns: {
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
        }[];
      };
      shop_rate_yield: {
        Args: Record<string, never>;
        Returns: {
          rate_bps: number;
          loan_count: number;
          principal_paise: number;
          one_period_yield_paise: number;
          six_period_yield_paise: number;
          twelve_period_yield_paise: number;
        }[];
      };
      generate_loan_notices: {
        Args: { p_as_of?: string };
        Returns: number;
      };
      claim_pending_loan_notice_pushes: {
        Args: { p_limit?: number };
        Returns: {
          notice_id: string;
          loan_id: string;
          customer_id: string;
          notice_type: string;
          serial_number: string;
          expo_push_tokens: string[];
        }[];
      };
      upsert_own_push_token: {
        Args: { p_expo_push_token: string; p_platform: string };
        Returns: string;
      };
      loan_current_due_on: {
        Args: { p_loan_id: string };
        Returns: string | null;
      };
      customer_loan_reminder_schedule: {
        Args: { p_as_of?: string };
        Returns: {
          loan_id: string;
          serial_number: string;
          due_on: string;
          reminder_kind: string;
          fire_at: string;
        }[];
      };
      create_loan: {
        Args: {
          p_customer_id: string;
          p_serial_number: string;
          p_receipt_image_url: string | null;
          p_principal_paise: number;
          p_rate_bps: number;
          p_disbursed_on: string;
          p_interest_model: InterestModel;
          p_digital_signature_url: string | null;
          p_items: Json;
          p_idempotency_key?: string | null;
        };
        Returns: {
          loan_id: string;
          item_ids: string[];
        }[];
      };
      redeem_loan: {
        Args: {
          p_loan_id: string;
          p_redeemed_on: string;
          p_released_to_name: string;
          p_item_ids: string[];
          p_final_payment_paise?: number;
          p_release_note?: string | null;
          p_release_signature_url?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: {
          loan_id: string;
          status: LoanStatus;
          redeemed_on: string;
          redeemed_by: string;
          closure_balance_paise: number;
          already_redeemed: boolean;
        }[];
      };
      default_loan: {
        Args: {
          p_loan_id: string;
          p_defaulted_on: string;
          p_reason: string;
        };
        Returns: {
          loan_id: string;
          status: LoanStatus;
          defaulted_on: string;
          defaulted_by: string;
          default_balance_paise: number;
          already_defaulted: boolean;
        }[];
      };
      loans_are_concealed: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      set_loans_concealed: {
        Args: { p_concealed: boolean };
        Returns: boolean;
      };
      update_shop_defaults: {
        Args: {
          p_rate_bps: number;
          p_partial_period_mode: PartialPeriodMode;
          p_round_up_threshold_days: number;
          p_simple_period_days: number;
          p_compound_every_days: number;
          p_grace_days: number;
        };
        Returns: {
          id: number;
          interest_model: InterestModel;
          rate_bps: number;
          merchant_rate_bps: number;
          simple_period_days: number;
          compound_every_days: number;
          grace_days: number;
          partial_period_mode: PartialPeriodMode;
          round_up_threshold_days: number;
          loans_concealed: boolean;
          updated_at: string;
        };
      };
      edit_loan_terms: {
        Args: {
          p_loan_id: string;
          p_rate_bps: number;
          p_interest_model: InterestModel;
          p_simple_period_days: number;
          p_compound_every_days: number;
          p_grace_days: number;
          p_partial_period_mode: PartialPeriodMode;
          p_round_up_threshold_days: number;
          p_reason: string;
        };
        Returns: {
          loan_id: string;
          change_count: number;
        }[];
      };
      renew_loan: {
        Args: {
          p_loan_id: string;
          p_renewed_on: string;
          p_interest_paid_paise: number;
          p_new_maturity_on: string;
          p_note?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: {
          renewal_id: string;
          loan_id: string;
          renewed_on: string;
          interest_paid_paise: number;
          new_maturity_on: string;
          already_renewed: boolean;
        }[];
      };
      log_payment: {
        Args: {
          p_loan_id: string;
          p_amount_paid_paise: number;
          p_paid_on: string;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      archive_loan: {
        Args: {
          p_loan_id: string;
          p_reason: string;
        };
        Returns: {
          loan_id: string;
          archived_at: string;
          archived_by: string;
          archive_reason: string;
          archive_balance_paise: number;
          already_archived: boolean;
        }[];
      };
      unarchive_loan: {
        Args: { p_loan_id: string };
        Returns: {
          loan_id: string;
          unarchived: boolean;
        }[];
      };
      unredeem_loan: {
        Args: {
          p_loan_id: string;
          p_reason: string;
        };
        Returns: {
          loan_id: string;
          status: LoanStatus;
          reversed_payment_id: string | null;
        }[];
      };
      issue_login_token: {
        Args: {
          p_profile_id: string;
          p_loan_id?: string | null;
        };
        Returns: string;
      };
      redeem_login_token: {
        Args: { p_token: string };
        Returns: {
          profile_id: string;
          loan_id: string | null;
        }[];
      };
      loan_receipt_mask_by_public_token: {
        Args: { p_token: string };
        Returns: {
          serial_last4: string;
        }[];
      };
      set_customer_pin: {
        Args: { p_pin: string };
        Returns: undefined;
      };
      set_customer_pin_for_profile: {
        Args: { p_profile_id: string; p_pin: string };
        Returns: undefined;
      };
      admin_reset_customer_pin: {
        Args: { p_profile_id: string };
        Returns: undefined;
      };
      verify_customer_pin: {
        Args: { p_phone: string; p_pin: string };
        Returns: {
          ok: boolean;
          profile_id: string | null;
        }[];
      };
      generate_opaque_token: {
        Args: { p_bytes?: number };
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      interest_model: InterestModel;
      partial_period_mode: PartialPeriodMode;
      loan_status: LoanStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
