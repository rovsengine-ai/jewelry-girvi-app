import type { PledgeMetal } from '@/types/database';
import type { OcrExtractionResult } from '@/types/database';

/**
 * Pure helpers for आंकलन-pad OCR strings. UI still formats only; money math stays SQL.
 * Grams returned as decimal strings for existing gramsInputToMg on save.
 */

/** "100000/-", "1000/", "5,000" → rupees number, or null if not parseable. */
export function parseLoanAmountRupees(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw);
  }
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const cleaned = trimmed
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/\/-?\s*$/, '')
    .replace(/₹/g, '')
    .replace(/rs\.?/gi, '');

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/**
 * Pad weights → grams for form fields.
 * "25|800mg" → 25.8; "47 gm" / "47g" → 47; "25800mg" → 25.8; "25.8" → 25.8
 */
export function parseWeightToGrams(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw;
  }
  if (raw == null) return null;
  const trimmed = String(raw).trim().toLowerCase().replace(/,/g, '');
  if (!trimmed) return null;

  const pipeMg = trimmed.match(/^(\d+)\s*[|／/]\s*(\d{1,3})\s*mg$/);
  if (pipeMg) {
    const grams = Number.parseInt(pipeMg[1], 10);
    const mg = Number.parseInt(pipeMg[2].padEnd(3, '0').slice(0, 3), 10);
    return grams + mg / 1000;
  }

  const onlyMg = trimmed.match(/^(\d+)\s*mg$/);
  if (onlyMg) {
    return Number.parseInt(onlyMg[1], 10) / 1000;
  }

  const gramsUnit = trimmed.match(/^(\d+(?:\.\d{1,3})?)\s*(?:gm|g|grams?|ग्राम)?$/);
  if (gramsUnit) {
    const value = Number.parseFloat(gramsUnit[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  return null;
}

/** "21|1|25", "30/10/23", "08-10-2022" → YYYY-MM-DD when confident. */
export function parseReceiptDate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isValidYmd(trimmed) ? trimmed : null;
  }

  const parts = trimmed.split(/[|/.\-]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 3) return null;

  const a = Number.parseInt(parts[0], 10);
  const b = Number.parseInt(parts[1], 10);
  const c = Number.parseInt(parts[2], 10);
  if (![a, b, c].every((n) => Number.isInteger(n))) return null;

  let day: number;
  let month: number;
  let year: number;

  if (parts[0].length === 4) {
    year = a;
    month = b;
    day = c;
  } else {
    day = a;
    month = b;
    year = c < 100 ? (c >= 70 ? 1900 + c : 2000 + c) : c;
  }

  const ymd = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isValidYmd(ymd) ? ymd : null;
}

function isValidYmd(ymd: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return false;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
  );
}

/** Clear gold/silver cue in ornament text; otherwise null (user picks). */
export function inferMetalFromItemName(itemName: string): PledgeMetal | null {
  const text = itemName.trim().toLowerCase();
  if (!text) return null;
  if (
    /सोना|स्वर्ण|\bgold\b|\bau\b/.test(text) ||
    text.includes('sona') ||
    text.includes('swarna')
  ) {
    return 'gold';
  }
  if (/चांदी|चाँदी|\bsilver\b|\bag\b/.test(text) || text.includes('chandi')) {
    return 'silver';
  }
  return null;
}

/** True when key counter fields are missing — show "please check" on review. */
export function isOcrExtractionPartial(result: OcrExtractionResult): boolean {
  const missingName = !result.customer_name.trim();
  const missingAmount = !(result.loan_amount > 0);
  const missingItem = !result.item_name.trim();
  const missingWeight = !(result.weight_grams > 0);
  const missingDate = !result.date.trim();
  const gaps = [missingName, missingAmount, missingItem, missingWeight, missingDate].filter(
    Boolean,
  ).length;
  return gaps >= 2;
}

/** Normalize edge-function JSON into form-ready OcrExtractionResult. */
export function normalizeOcrExtraction(raw: Partial<OcrExtractionResult> & Record<string, unknown>): OcrExtractionResult {
  const amount =
    parseLoanAmountRupees(
      (raw.loan_amount as string | number | undefined) ?? (raw.loan_amount_rupees as string | undefined),
    ) ?? 0;

  const weight =
    parseWeightToGrams(
      (raw.weight_grams as string | number | undefined) ?? (raw.weight as string | undefined),
    ) ?? 0;

  const date =
    parseReceiptDate(String(raw.date ?? '')) ??
    (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date.trim())
      ? raw.date.trim()
      : '');

  const interestRaw = raw.interest_rate;
  let interest_rate = 0;
  if (typeof interestRaw === 'number' && Number.isFinite(interestRaw) && interestRaw > 0) {
    // Reject huge ₹/month figures mistaken as % (e.g. 50 from "50/- प्रतिमाह").
    interest_rate = interestRaw > 0 && interestRaw <= 20 ? interestRaw : 0;
  }

  return {
    serial_number: String(raw.serial_number ?? '').trim(),
    date,
    customer_name: String(raw.customer_name ?? '').trim(),
    phone_number: String(raw.phone_number ?? '').trim(),
    address: String(raw.address ?? '').trim(),
    item_name: String(raw.item_name ?? '').trim(),
    weight_grams: weight,
    loan_amount: amount,
    interest_rate,
  };
}
