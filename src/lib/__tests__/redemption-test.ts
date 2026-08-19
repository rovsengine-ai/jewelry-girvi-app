import {
  addCalendarDays,
  allItemsReleased,
  canSubmitRedemption,
  customerLoanStatusLabel,
  defaultNewMaturityOn,
  isRenewalEligible,
  loanStatusLabel,
  parseNoTermChangeError,
  parseOwnerOnlyError,
  redeemGate,
} from '@/lib/redemption';

describe('loanStatusLabel', () => {
  test('names every status, including redeemed and defaulted', () => {
    expect(loanStatusLabel('active')).toBe('Active');
    expect(loanStatusLabel('redeemed')).toBe('Redeemed');
    expect(loanStatusLabel('closed')).toBe('Closed');
    expect(loanStatusLabel('defaulted')).toBe('Defaulted');
  });

  test('Hindi labels for every lifecycle status', () => {
    expect(loanStatusLabel('active', 'hi')).toBe('चालू');
    expect(loanStatusLabel('redeemed', 'hi')).toBe('छुड़ाई गई');
    expect(loanStatusLabel('closed', 'hi')).toBe('बंद');
    expect(loanStatusLabel('defaulted', 'hi')).toBe('ज़ब्त');
  });
});

describe('customerLoanStatusLabel', () => {
  test('redeemed loans tell the customer to collect items', () => {
    expect(customerLoanStatusLabel('redeemed')).toBe('Paid — collect items');
    expect(customerLoanStatusLabel('active')).toBe('Active');
    expect(customerLoanStatusLabel('redeemed', 'hi')).toBe('भुगतान हो गया — सामान लें');
  });
});

describe('redeemGate', () => {
  test('staff see owner_only even on an active loan', () => {
    expect(redeemGate('staff', 'active')).toEqual({ kind: 'owner_only' });
    expect(redeemGate('retail_customer', 'active')).toEqual({ kind: 'owner_only' });
  });

  test('an owner looking at a redeemed loan is told it is already done', () => {
    expect(redeemGate('owner', 'redeemed')).toEqual({ kind: 'already_redeemed' });
  });

  test('an owner cannot redeem a closed or defaulted loan', () => {
    expect(redeemGate('owner', 'closed')).toEqual({ kind: 'not_active', status: 'closed' });
    expect(redeemGate('owner', 'defaulted')).toEqual({ kind: 'not_active', status: 'defaulted' });
  });

  test('an owner and an active loan may proceed', () => {
    expect(redeemGate('owner', 'active')).toEqual({ kind: 'ready' });
  });

  test('missing role is owner-only; missing status is treated as closed', () => {
    expect(redeemGate(undefined, 'active')).toEqual({ kind: 'owner_only' });
    expect(redeemGate('owner', undefined)).toEqual({ kind: 'not_active', status: 'closed' });
  });
});

describe('allItemsReleased / canSubmitRedemption', () => {
  const ids = ['a', 'b', 'c'];

  test('every pledged item must be ticked', () => {
    expect(allItemsReleased(ids, [])).toBe(false);
    expect(allItemsReleased(ids, ['a', 'b'])).toBe(false);
    expect(allItemsReleased(ids, ['a', 'b', 'c'])).toBe(true);
  });

  test('an extra id that is not on the loan is not enough', () => {
    expect(allItemsReleased(ids, ['a', 'b', 'c', 'd'])).toBe(false);
  });

  test('a loan with no items can be submitted once a collector is named', () => {
    expect(allItemsReleased([], [])).toBe(true);
    expect(canSubmitRedemption({ releasedToName: 'Asha', itemIds: [], checkedIds: [] })).toEqual({
      ok: true,
    });
  });

  test('blank collector name is refused even if every item is ticked', () => {
    expect(canSubmitRedemption({ releasedToName: '  ', itemIds: ids, checkedIds: ids })).toEqual({
      ok: false,
      reason: 'redeem.validation.nameRequired',
    });
  });

  test('missing ticks are refused with a checklist message', () => {
    expect(canSubmitRedemption({ releasedToName: 'Asha', itemIds: ids, checkedIds: ['a'] })).toEqual({
      ok: false,
      reason: 'redeem.validation.allItemsRequired',
    });
  });

  test('same-size checklist with a wrong id is not a release', () => {
    expect(allItemsReleased(['a', 'b'], ['a', 'x'])).toBe(false);
  });

  test('a named collector and a complete checklist may submit', () => {
    expect(canSubmitRedemption({ releasedToName: 'Asha', itemIds: ids, checkedIds: ids })).toEqual({
      ok: true,
    });
  });
});

describe('renewal eligibility', () => {
  test('adds calendar days without timezone shift', () => {
    // 2024 is a leap year: 1 Jan + 180 = 29 Jun, not 30 Jun.
    expect(addCalendarDays('2024-01-01', 180)).toBe('2024-06-29');
    expect(addCalendarDays('2024-07-01', 180)).toBe('2024-12-28');
    expect(addCalendarDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addCalendarDays('2023-12-31', 1)).toBe('2024-01-01');
  });

  test('is offered only after the due date', () => {
    expect(isRenewalEligible('2024-01-01', 180, '2024-06-29')).toBe(false);
    expect(isRenewalEligible('2024-01-01', 180, '2024-06-30')).toBe(true);
  });

  test('a previous renewal moves the due date', () => {
    expect(isRenewalEligible('2024-01-01', 180, '2024-07-01', '2024-12-28')).toBe(false);
    expect(isRenewalEligible('2024-01-01', 180, '2024-12-29', '2024-12-28')).toBe(true);
  });

  test('default new maturity is another simple period from today', () => {
    expect(defaultNewMaturityOn('2024-07-01', 180)).toBe('2024-12-28');
  });
});

describe('parseOwnerOnlyError', () => {
  test('matches the RPC prefix and nothing else', () => {
    expect(parseOwnerOnlyError('owner_only: only the owner may redeem a loan')).toBe(true);
    expect(parseOwnerOnlyError('balance_remaining: loan still has 1 paise')).toBe(false);
  });
});

describe('parseNoTermChangeError', () => {
  test('matches the RPC prefix used when Save terms has no field diffs', () => {
    expect(parseNoTermChangeError('no_term_change: nothing to update')).toBe(true);
    expect(parseNoTermChangeError('term_change_reason is required')).toBe(false);
  });
});
