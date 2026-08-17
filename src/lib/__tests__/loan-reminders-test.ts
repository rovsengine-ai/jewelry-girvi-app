import {
  reminderCopy,
  reminderIdentifier,
  remindersToSchedule,
  type LoanReminderSlot,
} from '@/lib/loan-reminders';

const slot = (
  partial: Pick<LoanReminderSlot, 'reminder_kind' | 'fire_at'> & Partial<LoanReminderSlot>,
): LoanReminderSlot => ({
  loan_id: 'loan-1',
  serial_number: 'T080-A',
  due_on: '2024-06-29',
  ...partial,
});

describe('reminderCopy', () => {
  test('covers every kind without amounts', () => {
    expect(reminderCopy('due_soon', 'T080-A').title).toMatch(/reminder/i);
    expect(reminderCopy('due_today', 'T080-A').body).toContain('T080-A');
    expect(reminderCopy('overdue', 'T080-A').body).toMatch(/past due/i);
    expect(reminderCopy('due_soon', 'T080-A').body).not.toMatch(/₹|paise/i);
  });
});

describe('reminderIdentifier', () => {
  test('is stable per kind and loan', () => {
    expect(reminderIdentifier('overdue', 'loan-1')).toBe('girvi:overdue:loan-1');
  });
});

describe('remindersToSchedule', () => {
  const now = Date.parse('2024-06-01T03:30:00.000Z');

  test('drops fire_at that has already passed', () => {
    const rows = remindersToSchedule(
      [
        slot({ reminder_kind: 'due_soon', fire_at: '2024-05-01T03:30:00.000Z' }),
        slot({ reminder_kind: 'due_today', fire_at: '2024-06-29T03:30:00.000Z' }),
      ],
      now,
    );
    expect(rows.map((row) => row.reminder_kind)).toEqual(['due_today']);
  });

  test('keeps the later overdue slot when SQL also returns next-morning catch-up', () => {
    const rows = remindersToSchedule(
      [
        slot({ reminder_kind: 'overdue', fire_at: '2024-06-30T03:30:00.000Z' }),
        slot({ reminder_kind: 'overdue', fire_at: '2024-07-16T03:30:00.000Z' }),
      ],
      Date.parse('2024-07-15T12:00:00.000Z'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fire_at).toBe('2024-07-16T03:30:00.000Z');
  });
});
