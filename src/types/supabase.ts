import type { InterestModel, PartialPeriodMode, UserRole } from './database';

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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone_number?: string | null;
          address?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          phone_number?: string | null;
          address?: string | null;
          role?: UserRole;
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
          status: string;
          digital_signature_url: string | null;
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
          status?: string;
          digital_signature_url?: string | null;
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
          status?: string;
          digital_signature_url?: string | null;
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
    };
    Enums: {
      user_role: UserRole;
      interest_model: InterestModel;
      partial_period_mode: PartialPeriodMode;
    };
    CompositeTypes: Record<string, never>;
  };
}
