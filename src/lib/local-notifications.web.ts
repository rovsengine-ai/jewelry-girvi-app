/**
 * Browser due-date reminders while this tab stays open.
 * Uses the Notification API — not Expo push (that still needs a native install).
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

type Scheduled = {
  identifier: string;
  timeoutId: ReturnType<typeof setTimeout>;
};

const scheduled = new Map<string, Scheduled>();

function permissionStatus(): string {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'undetermined';
}

function showBrowserNotice(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    // Ignore — some browsers block Notification from insecure contexts.
  }
}

export async function cancelScheduledNotificationAsync(identifier: string): Promise<void> {
  const item = scheduled.get(identifier);
  if (!item) return;
  clearTimeout(item.timeoutId);
  scheduled.delete(identifier);
}

export async function getAllScheduledNotificationsAsync(): Promise<{ identifier: string }[]> {
  return Array.from(scheduled.keys()).map((identifier) => ({ identifier }));
}

export async function getPermissionsAsync(): Promise<{ status: string }> {
  return { status: permissionStatus() };
}

export async function requestPermissionsAsync(): Promise<{ status: string }> {
  if (typeof Notification === 'undefined') {
    return { status: 'denied' };
  }
  try {
    const result = await Notification.requestPermission();
    return { status: result === 'granted' ? 'granted' : 'denied' };
  } catch {
    return { status: 'denied' };
  }
}

export function setNotificationHandler(_handler: unknown): void {}

export async function scheduleNotificationAsync(request: {
  identifier?: string;
  content: { title: string; body: string };
  trigger: { type: string; date: Date; channelId?: string };
}): Promise<string> {
  const identifier =
    request.identifier ?? `web:${request.content.title}:${request.trigger.date.getTime()}`;
  await cancelScheduledNotificationAsync(identifier);

  const fireAt = request.trigger.date.getTime();
  const delay = Math.max(0, fireAt - Date.now());
  const timeoutId = setTimeout(() => {
    scheduled.delete(identifier);
    showBrowserNotice(request.content.title, request.content.body);
  }, delay);
  scheduled.set(identifier, { identifier, timeoutId });
  return identifier;
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
