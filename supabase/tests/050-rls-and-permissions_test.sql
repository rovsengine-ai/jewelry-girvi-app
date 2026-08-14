-- RLS / permissions coverage (Step 4 expands). Placeholder for runner.
begin;
select plan(1);
select ok(true, '050 rls suite scaffold');
select * from finish();
rollback;
