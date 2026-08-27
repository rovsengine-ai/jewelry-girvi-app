-- Enable Realtime Postgres Changes on loans and payments with RLS filtering.
-- Realtime delivers row events only when the subscriber's JWT passes the
-- table's SELECT policies (see Supabase Realtime postgres-changes docs).
-- REPLICA IDENTITY FULL is required so UPDATE/DELETE payloads include enough
-- of the old row for RLS to evaluate.

ALTER TABLE public.loans REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'loans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.loans;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;
END
$$;
