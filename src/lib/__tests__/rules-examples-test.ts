/**
 * Worked counter examples from docs/RULES.md. These are display/input results
 * only — interest itself is asserted in supabase/tests.
 */
import { formatBpsAsPercent, formatPaiseAsInr, percentInputToBps, rupeesInputToPaise } from '@/lib/money';
import { gramsInputToMg } from '@/lib/weight';
import { karatToMillesimal } from '@/lib/gold-purity';
import { addCalendarDays, isRenewalEligible } from '@/lib/redemption';

describe('RULES.md worked examples (client-visible results)', () => {
  test('50,000 rupees at 3% per 30 days is 5_000_000 paise and 300 bps', () => {
    expect(rupeesInputToPaise('50000')).toBe(5_000_000);
    expect(percentInputToBps('3')).toBe(300);
    expect(formatPaiseAsInr(5_000_000)).toBe('₹50,000');
    expect(formatBpsAsPercent(300)).toBe('3');
    // One month of interest on that loan is 1,500 rupees (SQL: 150000 paise).
    expect(formatPaiseAsInr(150_000)).toBe('₹1,500');
    expect(formatPaiseAsInr(5_000)).toBe('₹50');
    expect(formatPaiseAsInr(175_000)).toBe('₹1,750');
  });

  test.each([
    ['day 5 / 25 / 30 first-month or full month', 150_000, '₹1,500'],
    ['day 33 = one month + 3 days at ₹50/day', 165_000, '₹1,650'],
    ['day 35 = one month + 5 days (floor once per loan)', 175_000, '₹1,750'],
    ['day 55 remainder 25 rounds up to two months', 300_000, '₹3,000'],
  ] as const)('%s formats as %s', (_label, paise, inr) => {
    expect(formatPaiseAsInr(paise)).toBe(inr);
  });

  test('milligram weights never go through a float gram in domain state', () => {
    expect(gramsInputToMg('10.501')).toBe(10501);
    expect(gramsInputToMg('0.001')).toBe(1);
    expect(gramsInputToMg('4.001')).toBe(4001);
  });

  test('karat labels are millesimal bands, not karat/24', () => {
    expect(karatToMillesimal(22)).toBe(916);
    expect(karatToMillesimal(18)).toBe(750);
    expect(karatToMillesimal(24)).toBe(999);
  });

  test('renewal is offered only after due date (180 days from 2024-01-01 is 2024-06-29)', () => {
    expect(addCalendarDays('2024-01-01', 180)).toBe('2024-06-29');
    expect(isRenewalEligible('2024-01-01', 180, '2024-06-29')).toBe(false);
    expect(isRenewalEligible('2024-01-01', 180, '2024-06-30')).toBe(true);
  });
});
