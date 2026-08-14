import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

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
    await Notifications.setNotificationChannelAsync(LOAN_REMINDER_CHANNEL_ID, {
      name: ANDROID_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  return status === 'granted';
}

async function cancelOurScheduledReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.identifier.startsWith(LOAN_REMINDER_ID_PREFIX))
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
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
 * Schedule local DATE triggers from SQL fire_at values. Does not use Expo push
 * tokens: remote push is unavailable in Expo Go on Android from SDK 53.
 * https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
 */
export async function syncLoanReminderNotifications(
  slots: LoanReminderSlot[],
  nowMs: number = Date.now(),
): Promise<number> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
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
    const trigger: Notifications.NotificationTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(slot.fire_at),
      channelId: LOAN_REMINDER_CHANNEL_ID,
    };
    await Notifications.scheduleNotificationAsync({
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
