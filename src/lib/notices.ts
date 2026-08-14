import { asPaise, formatPaiseAsInr } from '@/lib/money';
import type { NoticeType, OverdueLoan } from '@/types/database';

export function noticeTypeLabel(type: NoticeType): string {
  switch (type) {
    case 'due_soon':
      return 'Due soon';
    case 'overdue':
      return 'Overdue';
    case 'renewal_offer':
      return 'Renewal offer';
    case 'forfeiture_warning':
      return 'Forfeiture warning';
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/** RFC 4180: quote only when the field contains comma, quote, or newline. */
export function csvEscape(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Call-list CSV from `loans_overdue_as_of` rows. Amounts are already paise from
 * SQL; this only stringifies them. No interest is computed here.
 */
export function buildOverdueCallListCsv(rows: OverdueLoan[]): string {
  const header =
    'serial_number,customer_name,phone_number,due_on,days_overdue,total_due_paise,total_due_inr';
  const lines = rows.map((row) => {
    const duePaise = asPaise(row.total_due_paise);
    return [
      csvEscape(row.serial_number),
      csvEscape(row.customer_name ?? ''),
      csvEscape(row.phone_number ?? ''),
      csvEscape(row.due_on),
      String(row.days_overdue),
      String(duePaise),
      csvEscape(formatPaiseAsInr(duePaise)),
    ].join(',');
  });
  return [header, ...lines].join('\n');
}
