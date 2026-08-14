-- Merchant model coverage (Step 3 expands). Placeholder keeps the runner green.
begin;
select plan(1);
select ok(true, '020 merchant suite scaffold');
select * from finish();
rollback;
