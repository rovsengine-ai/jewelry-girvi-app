import { translate, type AppLanguage } from '@/i18n';
import type { LoanStatus, UserRole } from '@/types/database';

export type RedeemGate =
  | { kind: 'owner_only' }
  | { kind: 'already_redeemed' }
  | { kind: 'not_active'; status: LoanStatus }
  | { kind: 'ready' };

export function loanStatusLabel(status: LoanStatus, language?: AppLanguage): string {
  switch (status) {
    case 'active':
    case 'redeemed':
    case 'closed':
    case 'defaulted':
      return translate(`loans.status.${status}`, undefined, language);
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function redeemGate(
  role: UserRole | undefined,
  status: LoanStatus | undefined,
): RedeemGate {
  if (role !== 'owner') {
    return { kind: 'owner_only' };
  }
  if (status === 'redeemed') {
    return { kind: 'already_redeemed' };
  }
  if (status !== 'active') {
    return { kind: 'not_active', status: status ?? 'closed' };
  }
  return { kind: 'ready' };
}

export function allItemsReleased(itemIds: string[], checkedIds: Iterable<string>): boolean {
  if (itemIds.length === 0) {
    return true;
  }
  const checked = new Set(checkedIds);
  if (checked.size !== itemIds.length) {
    return false;
  }
  return itemIds.every((id) => checked.has(id));
}

export function canSubmitRedemption(input: {
  releasedToName: string;
  itemIds: string[];
  checkedIds: Iterable<string>;
}): { ok: true } | { ok: false; reason: 'redeem.validation.nameRequired' | 'redeem.validation.allItemsRequired' } {
  if (input.releasedToName.trim() === '') {
    return { ok: false, reason: 'redeem.validation.nameRequired' };
  }
  if (!allItemsReleased(input.itemIds, input.checkedIds)) {
    return { ok: false, reason: 'redeem.validation.allItemsRequired' };
  }
  return { ok: true };
}

/**
 * Calendar-date arithmetic on a DATE (YYYY-MM-DD), not a timestamp. Using UTC
 * avoids Asia/Kolkata offset shifting the calendar day.
 */
export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  const yyyy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Offered only after the current due date, matching loans_overdue_as_of. */
export function isRenewalEligible(
  disbursedOn: string,
  simplePeriodDays: number,
  asOf: string,
  latestMaturityOn?: string | null,
): boolean {
  const dueOn = latestMaturityOn ?? addCalendarDays(disbursedOn, simplePeriodDays);
  return asOf > dueOn;
}

export function defaultNewMaturityOn(renewedOn: string, simplePeriodDays: number): string {
  return addCalendarDays(renewedOn, simplePeriodDays);
}

export function parseOwnerOnlyError(message: string): boolean {
  return message.startsWith('owner_only:');
}
