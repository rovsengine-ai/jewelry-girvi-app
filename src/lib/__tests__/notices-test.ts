import { buildOverdueCallListCsv, csvEscape, noticeTypeLabel } from '@/lib/notices';
import type { OverdueLoan } from '@/types/database';

describe('noticeTypeLabel', () => {
  test('covers every notice type', () => {
    expect(noticeTypeLabel('due_soon')).toBe('Due soon');
    expect(noticeTypeLabel('overdue')).toBe('Overdue');
    expect(noticeTypeLabel('renewal_offer')).toBe('Renewal offer');
    expect(noticeTypeLabel('forfeiture_warning')).toBe('Forfeiture warning');
    expect(noticeTypeLabel('due_soon', 'hi')).toBe('जल्द देय');
    expect(noticeTypeLabel('overdue', 'hi')).toBe('बकाया');
    expect(noticeTypeLabel('renewal_offer', 'hi')).toBe('नवीनीकरण प्रस्ताव');
    expect(noticeTypeLabel('forfeiture_warning', 'hi')).toBe('ज़ब्ती चेतावनी');
  });
});

describe('csvEscape', () => {
  test('leaves plain fields alone', () => {
    expect(csvEscape('T070-A')).toBe('T070-A');
    expect(csvEscape('+919876543210')).toBe('+919876543210');
  });

  test('quotes commas, quotes, and newlines', () => {
    expect(csvEscape('Patil, Asha')).toBe('"Patil, Asha"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape('a\rb')).toBe('"a\rb"');
  });
});

describe('buildOverdueCallListCsv', () => {
  const row: OverdueLoan = {
    loan_id: 'loan-1',
    customer_id: 'cust-1',
    serial_number: 'T070-A',
    disbursed_on: '2024-01-01',
    due_on: '2024-06-29',
    days_overdue: 1,
    outstanding_principal_paise: 1000000,
    accrued_interest_paise: 30000,
    total_due_paise: 1030000,
    customer_name: 'Patil, Asha',
    phone_number: '+919876543210',
  };

  test('emits a header and one data row with server paise, not a computed yield', () => {
    const csv = buildOverdueCallListCsv([row]);
    const [header, data] = csv.split('\n');
    expect(header).toBe(
      'serial_number,customer_name,phone_number,due_on,days_overdue,total_due_paise,total_due_inr',
    );
    expect(data).toBe(
      'T070-A,"Patil, Asha",+919876543210,2024-06-29,1,1030000,"₹10,300"',
    );
  });

  test('an empty list is still a valid header-only CSV', () => {
    expect(buildOverdueCallListCsv([])).toBe(
      'serial_number,customer_name,phone_number,due_on,days_overdue,total_due_paise,total_due_inr',
    );
  });

  test('null name and phone become empty CSV fields', () => {
    const csv = buildOverdueCallListCsv([{ ...row, customer_name: null, phone_number: null }]);
    const data = csv.split('\n')[1];
    expect(data).toBe('T070-A,,2024-06-29,1,1030000,"₹10,300"');
  });
});
