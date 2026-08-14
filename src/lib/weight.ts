/** Integer milligrams. Never store grams-as-decimal in domain state. */
export type Milligrams = number;

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer, got ${value}`);
  }
}

/**
 * Parse a gram input string (e.g. "10.5" or "10.500") into milligrams.
 * Rejects more than 3 decimal places — the milligram is the smallest unit.
 * Zero is allowed here (stone deduction); callers that need a positive gross
 * or net must check after conversion.
 */
export function gramsInputToMg(grams: string): Milligrams {
  const trimmed = grams.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) {
    throw new Error('Enter a valid weight in grams (up to 3 decimal places).');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const mg =
    Number.parseInt(whole, 10) * 1000 + Number.parseInt((fraction + '000').slice(0, 3), 10);
  assertInteger(mg, 'milligrams');
  if (mg < 0) {
    throw new Error('Weight cannot be negative.');
  }
  return mg;
}

/** Reverse of gramsInputToMg, for prefilling a weight field. Zero is allowed. */
export function mgToGramsInput(mg: Milligrams): string {
  assertInteger(mg, 'milligrams');
  if (mg < 0) {
    throw new Error('Weight cannot be negative.');
  }
  const grams = Math.trunc(mg / 1000);
  const rem = mg % 1000;
  if (rem === 0) {
    return String(grams);
  }
  return `${grams}.${String(rem).padStart(3, '0').replace(/0+$/, '')}`;
}
