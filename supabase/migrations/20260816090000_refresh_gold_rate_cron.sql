-- Daily gold-rate refresh: pg_cron at 09:15 Asia/Kolkata (03:45 UTC; IST has
-- no DST) POSTs to refresh-gold-rate via pg_net. Quotes are never IBJA.
-- Idempotency: gold_rates UNIQUE (quoted_on, purity_millesimal, source)
-- from 20260815100000; the Edge Function upserts on that key.
--
-- Vault secrets the operator must create (never EXPO_PUBLIC_*):
--   project_url              e.g. https://<ref>.supabase.co  (local: http://kong:8000)
--   publishable_key          anon / publishable JWT
--   gold_rate_cron_secret    same value as Edge Function secret GOLD_RATE_CRON_SECRET
--
-- If CREATE EXTENSION pg_cron is refused on the target plan, do not fake a
-- job: schedule the same HTTP POST from Dashboard → Integrations → Cron
-- (https://supabase.com/docs/guides/cron) at 09:15 Asia/Kolkata.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE OR REPLACE FUNCTION public.invoke_refresh_gold_rate()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  v_url text;
  v_key text;
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT ds.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'project_url'
  LIMIT 1;

  SELECT ds.decrypted_secret INTO v_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'publishable_key'
  LIMIT 1;

  SELECT ds.decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'gold_rate_cron_secret'
  LIMIT 1;

  IF v_url IS NULL OR btrim(v_url) = '' OR v_key IS NULL OR btrim(v_key) = '' THEN
    RAISE NOTICE 'invoke_refresh_gold_rate skipped: vault secrets project_url / publishable_key not set';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/refresh-gold-rate',
    headers := jsonb_strip_nulls(
      jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key,
        'apikey', v_key,
        'x-gold-rate-cron-secret', NULLIF(btrim(coalesce(v_secret, '')), '')
      )
    ),
    body := jsonb_build_object(
      'triggered_by', 'pg_cron',
      'label', 'not IBJA'
    ),
    timeout_milliseconds := 30000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.invoke_refresh_gold_rate() IS
  'Cron helper. POSTs refresh-gold-rate. Not a client RPC. Keys live in Vault, never EXPO_PUBLIC_*.';

REVOKE ALL ON FUNCTION public.invoke_refresh_gold_rate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_refresh_gold_rate() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_refresh_gold_rate() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT EXECUTE ON FUNCTION public.invoke_refresh_gold_rate() TO supabase_admin;
  END IF;
END $$;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'refresh-gold-rate-0915-ist'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  -- 09:15 Asia/Kolkata = 03:45 UTC (IST, no DST).
  PERFORM cron.schedule(
    'refresh-gold-rate-0915-ist',
    '45 3 * * *',
    $cron$SELECT public.invoke_refresh_gold_rate();$cron$
  );
END $$;
