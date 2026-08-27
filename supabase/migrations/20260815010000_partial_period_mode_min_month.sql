-- Adds the 'min_month_then_pro_rata' accrual mode decided by the shop owner.
--
-- This is deliberately a migration of its own: PostgreSQL forbids USING a new
-- enum label in the same transaction that adds it, and the Supabase CLI wraps
-- each migration file in one transaction. The columns, defaults and functions
-- that reference the label therefore live in the next migration.
ALTER TYPE public.partial_period_mode ADD VALUE IF NOT EXISTS 'min_month_then_pro_rata';
