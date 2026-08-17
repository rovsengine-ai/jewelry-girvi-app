-- Tear down live gold-rate cron only. Keep gold_rates + valuation SQL.
-- Never edit 20260816090000_refresh_gold_rate_cron.sql.

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace n
    JOIN pg_class c ON c.relnamespace = n.oid
    WHERE n.nspname = 'cron' AND c.relname = 'job'
  ) THEN
    FOR v_jobid IN
      SELECT jobid FROM cron.job WHERE jobname = 'refresh-gold-rate-0915-ist'
    LOOP
      PERFORM cron.unschedule(v_jobid);
    END LOOP;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.invoke_refresh_gold_rate();
