import type { PaymentType, UserRole } from './database';

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
      loans: {
        Row: {
          id: string;
          customer_id: string;
          serial_number: string;
          receipt_image_url: string | null;
          item_name: string;
          weight_grams: number;
          loan_amount: number;
          interest_rate_monthly: number;
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
          loan_amount: number;
          interest_rate_monthly: number;
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
          loan_amount?: number;
          interest_rate_monthly?: number;
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
          amount_paid: number;
          payment_type: PaymentType;
          created_at: string;
        };
        Insert: {
          id?: string;
          loan_id: string;
          amount_paid: number;
          payment_type: PaymentType;
          created_at?: string;
        };
        Update: {
          loan_id?: string;
          amount_paid?: number;
          payment_type?: PaymentType;
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
    };
    Views: Record<string, never>;
    Functions: {
      find_profile_by_phone: {
        Args: { p_phone: string };
        Returns: string | null;
      };
    };
    Enums: {
      user_role: UserRole;
      payment_type: PaymentType;
    };
    CompositeTypes: Record<string, never>;
  };
}
