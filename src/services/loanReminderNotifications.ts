import { Platform } from 'react-native';

import {
  AndroidImportance,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
  setNotificationChannelAsync,
  type NotificationTriggerInput,
} from '@/lib/local-notifications';
import {
  LOAN_REMINDER_CHANNEL_ID,
  LOAN_REMINDER_ID_PREFIX,
  reminderCopy,
  reminderIdentifier,
  remindersToSchedule,
  type LoanReminderSlot,
} from '@/lib/loan-reminders';

export { remindersToSchedule } from '@/lib/loan-reminders';

const ANDROID_CHANNEL_NAME = 'Loan payment reminders';

export async function ensureLoanReminderPermissions(): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return false;
  }

  if (Platform.OS === 'android') {
    await setNotificationChannelAsync(LOAN_REMINDER_CHANNEL_ID, {
      name: ANDROID_CHANNEL_NAME,
      importance: AndroidImportance.HIGH,
    });
  }

  const existing = await getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await requestPermissionsAsync();
    status = requested.status;
  }
  return status === 'granted';
}

async function cancelOurScheduledReminders(): Promise<void> {
  const scheduled = await getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.identifier.startsWith(LOAN_REMINDER_ID_PREFIX))
      .map((item) => cancelScheduledNotificationAsync(item.identifier)),
  );
}

/** Drop OS reminders so a later sign-in on this device does not inherit them. */
export async function clearLoanReminderNotifications(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }
  await cancelOurScheduledReminders();
}

/**
 * Schedule local DATE triggers from SQL fire_at values when this profile has
 * no Expo push token. If a push token is registered, remote push (edge
 * function) delivers notices — do not also fire local OS reminders for the
 * same due/overdue events.
 *
 * https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
 */
export async function syncLoanReminderNotifications(
  slots: LoanReminderSlot[],
  nowMs: number = Date.now(),
  options?: { preferRemotePush?: boolean },
): Promise<number> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return 0;
  }

  const preferRemotePush = options?.preferRemotePush === true;
  if (preferRemotePush) {
    await cancelOurScheduledReminders();
    return 0;
  }

  const allowed = await ensureLoanReminderPermissions();
  if (!allowed) {
    return 0;
  }

  await cancelOurScheduledReminders();

  const toSchedule = remindersToSchedule(slots, nowMs);
  for (const slot of toSchedule) {
    const copy = reminderCopy(slot.reminder_kind, slot.serial_number);
    const trigger: NotificationTriggerInput = {
      type: SchedulableTriggerInputTypes.DATE,
      date: new Date(slot.fire_at),
      channelId: LOAN_REMINDER_CHANNEL_ID,
    };
    await scheduleNotificationAsync({
      identifier: reminderIdentifier(slot.reminder_kind, slot.loan_id),
      content: {
        title: copy.title,
        body: copy.body,
        data: { loanId: slot.loan_id, reminderKind: slot.reminder_kind },
      },
      trigger,
    });
  }
  return toSchedule.length;
}
