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
          created_at: string;
          updated_at: string;
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
          created_at?: string;
          updated_at?: string;
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
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'loans_customer_id_fkey';
            columns: ['customer_id'];
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
          valuation_paise: number | null;
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
          valuation_paise?: number | null;
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
          valuation_paise?: number | null;
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
    };
    Views: Record<string, never>;
    Functions: {
      find_profile_by_phone: {
        Args: { p_phone: string };
        Returns: string | null;
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
      renew_loan: {
        Args: {
          p_loan_id: string;
          p_renewed_on: string;
          p_interest_paid_paise: number;
          p_new_maturity_on: string;
          p_note?: string | null;
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
