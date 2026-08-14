export type ReminderKind = 'due_soon' | 'due_today' | 'overdue';

export interface LoanReminderSlot {
  loan_id: string;
  serial_number: string;
  due_on: string;
  reminder_kind: ReminderKind;
  fire_at: string;
}

export function isReminderKind(value: string): value is ReminderKind {
  return value === 'due_soon' || value === 'due_today' || value === 'overdue';
}

/** Lock-screen copy. No rupee amounts. */
export function reminderCopy(
  kind: ReminderKind,
  serialNumber: string,
): { title: string; body: string } {
  switch (kind) {
    case 'due_soon':
      return {
        title: 'Girvi payment reminder',
        body: `${serialNumber} is due in 15 days. Open the app for your receipt.`,
      };
    case 'due_today':
      return {
        title: 'Girvi payment due today',
        body: `${serialNumber} is due today. Visit the shop to pay or renew.`,
      };
    case 'overdue':
      return {
        title: 'Girvi payment overdue',
        body: `${serialNumber} is past due. Contact the shop to pay or renew.`,
      };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export const LOAN_REMINDER_CHANNEL_ID = 'loan-reminders';
export const LOAN_REMINDER_ID_PREFIX = 'girvi:';

export function reminderIdentifier(kind: ReminderKind, loanId: string): string {
  return `${LOAN_REMINDER_ID_PREFIX}${kind}:${loanId}`;
}

/**
 * Keep one future OS trigger per (kind, loan). Past fire_at values are skipped
 * because the OS will not honour them; overdue-ness itself comes from SQL.
 */
export function remindersToSchedule(slots: LoanReminderSlot[], nowMs: number): LoanReminderSlot[] {
  const latest = new Map<string, LoanReminderSlot>();
  for (const slot of slots) {
    if (!isReminderKind(slot.reminder_kind)) continue;
    const fireMs = Date.parse(slot.fire_at);
    if (!Number.isFinite(fireMs) || fireMs <= nowMs) continue;
    const key = `${slot.reminder_kind}:${slot.loan_id}`;
    const previous = latest.get(key);
    if (!previous || Date.parse(previous.fire_at) < fireMs) {
      latest.set(key, slot);
    }
  }
  return [...latest.values()];
}
