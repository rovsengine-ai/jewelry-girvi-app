import { gramsInputToMg, mgToGramsInput } from '@/lib/weight';

describe('gramsInputToMg', () => {
  test('converts whole grams', () => {
    expect(gramsInputToMg('10')).toBe(10000);
  });

  test('converts three decimal places exactly, without float', () => {
    expect(gramsInputToMg('10.500')).toBe(10500);
    expect(gramsInputToMg('0.001')).toBe(1);
    expect(gramsInputToMg('10.5')).toBe(10500);
  });

  test('allows zero so stone deduction can be none', () => {
    expect(gramsInputToMg('0')).toBe(0);
    expect(gramsInputToMg('0.000')).toBe(0);
  });

  test.each([
    ['', 'empty'],
    ['abc', 'letters'],
    ['10.5556', 'four decimal places'],
    ['-1', 'negative sign'],
    ['1.2.3', 'two decimal points'],
    ['10g', 'unit suffix'],
  ])('rejects %p (%s)', (input) => {
    expect(() => gramsInputToMg(input)).toThrow(
      'Enter a valid weight in grams (up to 3 decimal places).',
    );
  });
});

describe('mgToGramsInput', () => {
  test('is the reverse of gramsInputToMg', () => {
    expect(mgToGramsInput(10000)).toBe('10');
    expect(mgToGramsInput(10500)).toBe('10.5');
    expect(mgToGramsInput(1)).toBe('0.001');
  });
});
