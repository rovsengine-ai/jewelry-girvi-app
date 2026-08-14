/** Integer paise. Never store rupees-as-decimal in domain state. */
export type Paise = number;

/** Integer basis points per 30-day period (2% = 200). */
export type BasisPoints = number;

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer, got ${value}`);
  }
}

/** Parse a rupee input string (e.g. "1250.50") into paise. Rejects invalid input. */
export function rupeesInputToPaise(rupees: string): Paise {
  const trimmed = rupees.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Enter a valid amount in rupees (up to 2 decimal places).');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const paise = Number.parseInt(whole, 10) * 100 + Number.parseInt((fraction + '00').slice(0, 2), 10);
  assertInteger(paise, 'paise');
  if (paise <= 0) {
    throw new Error('Amount must be greater than zero.');
  }
  return paise;
}

/** Monthly percent input string (e.g. "3" or "1.5") → basis points. */
export function percentInputToBps(percent: string): BasisPoints {
  const trimmed = percent.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Enter a valid monthly percent rate.');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const bps = Number.parseInt(whole, 10) * 100 + Number.parseInt((fraction + '00').slice(0, 2), 10);
  assertInteger(bps, 'rate_bps');
  if (bps <= 0 || bps > 10000) {
    throw new Error('Rate must be between 0.01% and 100%.');
  }
  return bps;
}

/** Reverse of rupeesInputToPaise, for prefilling an amount field. Zero is allowed. */
export function paiseToRupeesInput(paise: Paise): string {
  assertInteger(paise, 'paise');
  if (paise < 0) {
    throw new Error('Amount cannot be negative.');
  }
  const rupees = Math.trunc(paise / 100);
  const rem = paise % 100;
  if (rem === 0) {
    return String(rupees);
  }
  return `${rupees}.${String(rem).padStart(2, '0')}`;
}

export function formatPaiseAsInr(paise: Paise | string): string {
  const value = asPaise(paise);
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const rupees = Math.trunc(abs / 100);
  const rem = abs % 100;
  const grouped = rupees.toLocaleString('en-IN');
  return rem === 0 ? `${sign}₹${grouped}` : `${sign}₹${grouped}.${String(rem).padStart(2, '0')}`;
}

export function formatBpsAsPercent(bps: BasisPoints): string {
  assertInteger(bps, 'rate_bps');
  const whole = Math.trunc(bps / 100);
  const frac = Math.abs(bps % 100);
  if (frac === 0) return `${whole}`;
  const fracStr = String(frac).padStart(2, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

/** Coerce PostgREST bigint/int that may arrive as string. */
export function asPaise(value: number | string): Paise {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Invalid paise value: ${value}`);
  }
  return n;
}

export function asBps(value: number | string): BasisPoints {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Invalid basis-points value: ${value}`);
  }
  return n;
}

/** Today's calendar date in Asia/Kolkata as YYYY-MM-DD. */
export function todayInKolkata(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
