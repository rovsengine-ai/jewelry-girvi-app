-- Rounding / two-stage span math (H6 + Step 3 expansions).
begin;
select plan(6);

-- Half-up boundary (RULES: round half-up once).
-- div_round_half_up(n,d) = (n + d/2) / d in integer math.
-- 5/2 → (5+1)/2 = 3; 4/2 → (4+1)/2 = 2; 1/2 → (1+1)/2 = 1.
select is(public.div_round_half_up(5, 2), 3::bigint, 'half-up: 5/2 → 3');
select is(public.div_round_half_up(4, 2), 2::bigint, 'exact: 4/2 → 2');
select is(public.div_round_half_up(1, 2), 1::bigint, 'half-up: 1/2 → 1');

-- H6a: 12 complete periods — engine = 12 * period_interest (remainder 0).
-- Compare to single whole-span round: round(P*r*360/(30*10000)).
-- P=3333, r=233:
--   period = round(3333*233/10000) = round(77.6589) = 78
--   engine 12*78 = 936
--   whole  = round(3333*233*360/300000) = round(3333*233*12/10000)
--          = round(931.9068) = 932
-- Diff = +4 paise (engine charges MORE than one whole-span round).
select is(
  public.simple_span_interest_paise(3333, 233, 360, 30, 'pro_rata'),
  936::bigint,
  'H6a engine 12 periods @3333/233 = 936 (12×78)'
);
select is(
  public.div_round_half_up(3333::bigint * 233 * 360, 30 * 10000),
  932::bigint,
  'H6a whole-span round once = 932'
);

-- H6b: complete + remainder (two rounding stages inside simple_span).
-- P=333333, r=175, days=45 → 1 complete + 15 rem.
-- period = round(333333*175/10000) = round(5833.3275) = 5833
-- rem15  = round(333333*175*15/300000) = round(2916.66375) = 2917
-- engine = 5833+2917 = 8750
-- whole  = round(333333*175*45/300000) = round(8749.99125) = 8750
-- (no divergence on this sample — documents both numbers.)
select is(
  public.simple_span_interest_paise(333333, 175, 45, 30, 'pro_rata'),
  8750::bigint,
  'H6b engine 45d = 5833+2917 = 8750'
);

select * from finish();
rollback;
