-- install tests utilities
-- install pgtap extension for testing
create extension if not exists pgtap with schema extensions;
/*
---------------------
---- install dbdev ----
----------------------
Requires:
  - pg_tle: https://github.com/aws/pg_tle
  - pgsql-http: https://github.com/pramsey/pgsql-http

Skip the remote database.dev pull when basejump helpers are already installed
(common after a prior successful setup). The SSL timeout to api.database.dev
otherwise fails this file every run even though every domain suite is green.
*/
create extension if not exists http with schema extensions;
create extension if not exists pg_tle;

do $setup$
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'basejump-supabase_test_helpers'
  ) then
    raise notice 'basejump-supabase_test_helpers already present — skipping database.dev install';
    return;
  end if;

  -- Local pulls of database.dev can exceed the default ~1s curl timeout.
  perform set_config('http.timeout_msec', '60000', true);

  drop extension if exists "supabase-dbdev";
  perform pgtle.uninstall_extension_if_exists('supabase-dbdev');

  perform pgtle.install_extension(
      'supabase-dbdev',
      resp.contents ->> 'version',
      'PostgreSQL package manager',
      resp.contents ->> 'sql'
  )
  from extensions.http(
      (
          'GET',
          'https://api.database.dev/rest/v1/'
          || 'package_versions?select=sql,version'
          || '&package_name=eq.supabase-dbdev'
          || '&order=version.desc'
          || '&limit=1',
          array[
              ('apiKey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtdXB0cHBsZnZpaWZyYndtbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODAxMDczNzIsImV4cCI6MTk5NTY4MzM3Mn0.z2CN0mvO2No8wSi46Gw59DFGCTJrzM0AQKsu_5k134s')::extensions.http_header
          ],
          null,
          null
      )
  ) x,
  lateral (
      select
          ((row_to_json(x) -> 'content') #>> '{}')::json -> 0
  ) resp(contents);

  create extension "supabase-dbdev";
  perform dbdev.install('supabase-dbdev');
  drop extension if exists "supabase-dbdev";
  create extension "supabase-dbdev";
  -- Install test helpers
  perform dbdev.install('basejump-supabase_test_helpers');
  create extension if not exists "basejump-supabase_test_helpers" version '0.0.6';
end;
$setup$;

create extension if not exists "basejump-supabase_test_helpers" version '0.0.6';

-- Verify the hook actually installed what the later suites depend on, rather
-- than asserting a tautology. 040 and 050 impersonate users through these.
begin;
select plan(4);

select has_extension('extensions', 'pgtap', 'pgtap is installed');
select has_extension('basejump-supabase_test_helpers', 'basejump test helpers are installed');
select has_function('tests', 'create_supabase_user', 'tests.create_supabase_user is available');
select has_function('tests', 'authenticate_as', 'tests.authenticate_as is available');

select * from finish();
rollback;
