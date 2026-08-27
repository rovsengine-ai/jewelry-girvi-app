-- Lockstep: toE164India in src/lib/phone.ts must match normalize_phone_e164.
begin;
select plan(5);

select is(
  public.normalize_phone_e164('9876543210'),
  '+919876543210',
  'a 10-digit number becomes +91XXXXXXXXXX'
);

select is(
  public.normalize_phone_e164('09876543210'),
  '+919876543210',
  'a 0-prefixed 10-digit mobile is the same identity'
);

select is(
  public.normalize_phone_e164('+919876543210'),
  '+919876543210',
  'a +91 number is unchanged'
);

select is(
  public.normalize_phone_e164('919876543210'),
  '+919876543210',
  'a 91 number without + becomes +91XXXXXXXXXX'
);

select is(
  public.normalize_phone_e164('+91 98765-43210'),
  '+919876543210',
  'spaces and dashes are stripped'
);

select * from finish();
rollback;
