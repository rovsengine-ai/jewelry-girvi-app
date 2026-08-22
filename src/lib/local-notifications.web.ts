/**
 * Web stubs — local OS notifications do not run in a browser tab.
 * Web push is also out of scope: on iOS, browser push requires the site to be
 * installed to the Home Screen first, which most customers will not do.
 * Native: local-notifications.ts + push-token.ts
 * https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
 */

export const AndroidImportance = {
  UNKNOWN: 0,
  UNSPECIFIED: 1,
  NONE: 2,
  MIN: 3,
  LOW: 4,
  DEFAULT: 5,
  HIGH: 6,
  MAX: 7,
} as const;

export async function cancelScheduledNotificationAsync(_identifier: string): Promise<void> {}

export async function getAllScheduledNotificationsAsync(): Promise<
  { identifier: string }[]
> {
  return [];
}

export async function getPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'denied' };
}

export async function requestPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'denied' };
}

export function setNotificationHandler(_handler: unknown): void {}

export async function scheduleNotificationAsync(_request: unknown): Promise<string> {
  return '';
}

export async function setNotificationChannelAsync(
  _channelId: string,
  _channel: unknown,
): Promise<void> {}

export const SchedulableTriggerInputTypes = {
  DATE: 'date',
} as const;

export type NotificationTriggerInput = {
  type: string;
  date: Date;
  channelId?: string;
};
