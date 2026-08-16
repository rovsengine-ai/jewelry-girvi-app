import {
  inferMetalFromItemName,
  isOcrExtractionPartial,
  normalizeOcrExtraction,
  parseLoanAmountRupees,
  parseReceiptDate,
  parseWeightToGrams,
} from '@/lib/ocr-receipt-parse';

describe('parseLoanAmountRupees', () => {
  test('strips /- and commas', () => {
    expect(parseLoanAmountRupees('100000/-')).toBe(100000);
    expect(parseLoanAmountRupees('1000/')).toBe(1000);
    expect(parseLoanAmountRupees('5,000/-')).toBe(5000);
  });

  test('rejects empty or non-numeric', () => {
    expect(parseLoanAmountRupees('')).toBeNull();
    expect(parseLoanAmountRupees('एक हजार')).toBeNull();
  });
});

describe('parseWeightToGrams', () => {
  test('parses pipe milligram pad format', () => {
    expect(parseWeightToGrams('25|800mg')).toBe(25.8);
  });

  test('parses gm and bare grams', () => {
    expect(parseWeightToGrams('47 gm')).toBe(47);
    expect(parseWeightToGrams('47g')).toBe(47);
    expect(parseWeightToGrams('12.5')).toBe(12.5);
  });

  test('parses milligrams only', () => {
    expect(parseWeightToGrams('25800mg')).toBe(25.8);
  });
});

describe('parseReceiptDate', () => {
  test('normalizes pipe and slash dates', () => {
    expect(parseReceiptDate('21|1|25')).toBe('2025-01-21');
    expect(parseReceiptDate('30/10/23')).toBe('2023-10-30');
    expect(parseReceiptDate('08-10-2022')).toBe('2022-10-08');
  });

  test('keeps ISO dates', () => {
    expect(parseReceiptDate('2025-01-21')).toBe('2025-01-21');
  });

  test('rejects impossible days', () => {
    expect(parseReceiptDate('32/1/25')).toBeNull();
  });
});

describe('inferMetalFromItemName', () => {
  test('detects gold and silver cues', () => {
    expect(inferMetalFromItemName('सोना पेठा')).toBe('gold');
    expect(inferMetalFromItemName('Gold chain')).toBe('gold');
    expect(inferMetalFromItemName('चांदी कड़ा')).toBe('silver');
    expect(inferMetalFromItemName('पायल')).toBeNull();
  });
});

describe('normalizeOcrExtraction', () => {
  test('normalizes pad-style strings and clamps ambiguous interest', () => {
    const result = normalizeOcrExtraction({
      serial_number: '7890',
      date: '21|1|25',
      customer_name: 'संतोष कुमार पाटिल',
      phone_number: '',
      address: '',
      item_name: 'सोना पेठा',
      weight_grams: '25|800mg' as unknown as number,
      loan_amount: '100000/-' as unknown as number,
      interest_rate: 50,
    });
    expect(result.date).toBe('2025-01-21');
    expect(result.weight_grams).toBe(25.8);
    expect(result.loan_amount).toBe(100000);
    expect(result.interest_rate).toBe(0);
    expect(result.customer_name).toBe('संतोष कुमार पाटिल');
  });

  test('keeps a clear percent interest', () => {
    expect(normalizeOcrExtraction({ interest_rate: 3 }).interest_rate).toBe(3);
  });
});

describe('isOcrExtractionPartial', () => {
  test('flags when multiple key fields are missing', () => {
    expect(
      isOcrExtractionPartial({
        serial_number: '1',
        date: '',
        customer_name: '',
        phone_number: '',
        address: '',
        item_name: '',
        weight_grams: 0,
        loan_amount: 0,
        interest_rate: 0,
      }),
    ).toBe(true);

    expect(
      isOcrExtractionPartial({
        serial_number: '7890',
        date: '2025-01-21',
        customer_name: 'संतोष',
        phone_number: '',
        address: '',
        item_name: 'पायल',
        weight_grams: 47,
        loan_amount: 1000,
        interest_rate: 0,
      }),
    ).toBe(false);
  });
});
