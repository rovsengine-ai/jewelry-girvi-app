import {
  asBps,
  asPaise,
  formatBpsAsPercent,
  formatPaiseAsInr,
  paiseToRupeesInput,
  percentInputToBps,
  rupeesInputToPaise,
  todayInKolkata,
} from '@/lib/money';

describe('rupeesInputToPaise', () => {
  test('converts whole rupees', () => {
    expect(rupeesInputToPaise('1250')).toBe(125000);
  });

  test('converts two decimal places exactly', () => {
    expect(rupeesInputToPaise('1250.50')).toBe(125050);
  });

  test('pads a single decimal place to paise', () => {
    // "0.5" rupees is 50 paise, not 5.
    expect(rupeesInputToPaise('0.5')).toBe(50);
  });

  test('strips thousands separators and surrounding whitespace', () => {
    expect(rupeesInputToPaise('  1,00,000.25 ')).toBe(10000025);
  });

  test('never loses a paisa to floating point', () => {
    // 0.1 + 0.2 style drift is the whole reason this function exists.
    expect(rupeesInputToPaise('0.07')).toBe(7);
    expect(rupeesInputToPaise('1.10')).toBe(110);
    expect(rupeesInputToPaise('99999999.99')).toBe(9999999999);
  });

  test.each([
    ['', 'empty'],
    ['abc', 'letters'],
    ['12.345', 'three decimal places'],
    ['-50', 'negative sign'],
    ['1.2.3', 'two decimal points'],
    ['₹100', 'currency symbol'],
    ['1e3', 'exponent notation'],
  ])('rejects %p (%s)', (input) => {
    expect(() => rupeesInputToPaise(input)).toThrow(
      'Enter a valid amount in rupees (up to 2 decimal places).',
    );
  });

  test('rejects zero, since a loan of nothing is not a loan', () => {
    expect(() => rupeesInputToPaise('0')).toThrow('Amount must be greater than zero.');
    expect(() => rupeesInputToPaise('0.00')).toThrow('Amount must be greater than zero.');
  });
});

describe('paiseToRupeesInput', () => {
  test('is the reverse of rupeesInputToPaise for positive amounts', () => {
    expect(paiseToRupeesInput(125000)).toBe('1250');
    expect(paiseToRupeesInput(125050)).toBe('1250.50');
    expect(paiseToRupeesInput(7)).toBe('0.07');
  });

  test('allows zero so a fully-paid loan can prefill an empty payment', () => {
    expect(paiseToRupeesInput(0)).toBe('0');
  });

  test('rejects negative and non-integer paise', () => {
    expect(() => paiseToRupeesInput(-1)).toThrow('Amount cannot be negative.');
    expect(() => paiseToRupeesInput(1.5)).toThrow('paise must be an integer, got 1.5');
  });

  test.each(['1250', '1250.50', '0.07'] as const)('round-trips rupee input %p', (rupees) => {
    expect(paiseToRupeesInput(rupeesInputToPaise(rupees))).toBe(rupees);
  });

  test('one paisa is the smallest typed amount', () => {
    expect(rupeesInputToPaise('0.01')).toBe(1);
    expect(formatPaiseAsInr(1)).toBe('₹0.01');
  });
});

describe('percentInputToBps', () => {
  test('converts whole percents', () => {
    expect(percentInputToBps('3')).toBe(300);
  });

  test('converts fractional percents', () => {
    expect(percentInputToBps('1.5')).toBe(150);
    expect(percentInputToBps('  1.5  ')).toBe(150);
    expect(percentInputToBps('0.01')).toBe(1);
  });

  test('rejects a percent sign or comma in the rate field', () => {
    expect(() => percentInputToBps('1.5%')).toThrow('Enter a valid monthly percent rate.');
    expect(() => percentInputToBps('1,5')).toThrow('Enter a valid monthly percent rate.');
  });

  test('accepts the 100% ceiling', () => {
    expect(percentInputToBps('100')).toBe(10000);
  });

  test('rejects above 100%', () => {
    expect(() => percentInputToBps('100.01')).toThrow('Rate must be between 0.01% and 100%.');
  });

  test('rejects zero', () => {
    expect(() => percentInputToBps('0')).toThrow('Rate must be between 0.01% and 100%.');
  });

  test('rejects malformed input', () => {
    expect(() => percentInputToBps('three')).toThrow('Enter a valid monthly percent rate.');
  });
});

describe('formatPaiseAsInr', () => {
  test('omits paise when the amount is whole rupees', () => {
    expect(formatPaiseAsInr(125000)).toBe('₹1,250');
  });

  test('shows paise, zero-padded, when present', () => {
    expect(formatPaiseAsInr(125005)).toBe('₹1,250.05');
    expect(formatPaiseAsInr(125050)).toBe('₹1,250.50');
  });

  test('groups in the Indian lakh/crore pattern, not thousands', () => {
    // Grouping is 2-2-3 from the right, not 3-3-3.
    // 1 lakh rupees  =    100000 rupees =    10000000 paise → 1,00,000
    // 1 crore rupees =  10000000 rupees =  1000000000 paise → 1,00,00,000
    expect(formatPaiseAsInr(10000000)).toBe('₹1,00,000');
    expect(formatPaiseAsInr(1000000000)).toBe('₹1,00,00,000');
    expect(formatPaiseAsInr(100000000)).toBe('₹10,00,000');
  });

  test('handles zero and sub-rupee amounts', () => {
    expect(formatPaiseAsInr(0)).toBe('₹0');
    expect(formatPaiseAsInr(7)).toBe('₹0.07');
  });

  test('places the sign before the rupee symbol', () => {
    expect(formatPaiseAsInr(-125050)).toBe('-₹1,250.50');
  });

  test('accepts a PostgREST bigint arriving as a string', () => {
    expect(formatPaiseAsInr('125050')).toBe('₹1,250.50');
  });
});

describe('formatBpsAsPercent', () => {
  test('renders whole percents without a decimal point', () => {
    expect(formatBpsAsPercent(300)).toBe('3');
  });

  test('trims trailing zeros from the fraction', () => {
    expect(formatBpsAsPercent(150)).toBe('1.5');
  });

  test('keeps both fraction digits when both are significant', () => {
    expect(formatBpsAsPercent(325)).toBe('3.25');
  });

  test('FLAGGED: sub-0.1% rates lose their value entirely', () => {
    // 1 bps = 0.01%. frac = 1 → padStart gives '01' → the /0+$/ strip removes
    // the trailing '1'... no: it strips trailing ZEROS, leaving '01', so this
    // renders '0.01'. But 10 bps = 0.10% → frac 10 → '10' → strip → '1' → '0.1'.
    // Correct in both cases; recorded here because the pad-then-strip pairing is
    // easy to break and silently mis-prices a rate on screen.
    expect(formatBpsAsPercent(1)).toBe('0.01');
    expect(formatBpsAsPercent(10)).toBe('0.1');
  });

  test('rejects a non-integer rate', () => {
    expect(() => formatBpsAsPercent(1.5)).toThrow('rate_bps must be an integer, got 1.5');
  });

  test('keeps the sign on a negative rate display', () => {
    expect(formatBpsAsPercent(-150)).toBe('-1.5');
  });
});

describe('asPaise / asBps', () => {
  test('pass integers through', () => {
    expect(asPaise(125000)).toBe(125000);
    expect(asBps(300)).toBe(300);
  });

  test('parse the strings PostgREST returns for bigint columns', () => {
    expect(asPaise('125000')).toBe(125000);
    expect(asBps('300')).toBe(300);
  });

  test('reject values that would silently corrupt money', () => {
    expect(() => asPaise(1250.5)).toThrow('Invalid paise value: 1250.5');
    expect(() => asPaise('abc')).toThrow('Invalid paise value: abc');
    expect(() => asPaise(Number.NaN)).toThrow();
    expect(() => asPaise(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => asBps(1.5)).toThrow('Invalid basis-points value: 1.5');
  });

  test('FLAGGED: parseInt truncates rather than rejecting a decimal string', () => {
    // '1250.5' becomes 1250 because parseInt stops at the '.', so a malformed
    // string silently loses value where the numeric form would throw.
    expect(asPaise('1250.5')).toBe(1250);
    expect(asBps('300.5')).toBe(300);
  });
});

describe('todayInKolkata', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function freezeUtc(iso: string) {
    jest.useFakeTimers({ now: new Date(iso) });
  }

  test('returns YYYY-MM-DD', () => {
    expect(todayInKolkata()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('is already tomorrow in IST late in the UTC evening', () => {
    // 2024-06-29T19:00Z is 2024-06-30T00:30 IST. A UTC-based date would report
    // the 29th and under-report a day of interest at the counter. IST is
    // UTC+5:30, so the shop's day rolls over at 18:30 UTC.
    freezeUtc('2024-06-29T19:00:00.000Z');
    expect(todayInKolkata()).toBe('2024-06-30');
  });

  test('is still today in IST just before the 18:30 UTC rollover', () => {
    // 2024-06-29T18:00Z is 2024-06-29T23:30 IST.
    freezeUtc('2024-06-29T18:00:00.000Z');
    expect(todayInKolkata()).toBe('2024-06-29');
  });

  test('crosses the year boundary on IST time, not UTC time', () => {
    freezeUtc('2024-12-31T20:00:00.000Z');
    expect(todayInKolkata()).toBe('2025-01-01');
  });

  test('agrees with UTC during IST daytime', () => {
    freezeUtc('2024-06-29T06:00:00.000Z');
    expect(todayInKolkata()).toBe('2024-06-29');
  });
});
