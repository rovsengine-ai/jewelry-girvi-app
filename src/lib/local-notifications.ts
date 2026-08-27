/**
 * Local (on-device) notification APIs — offline fallback when the customer has
 * no Expo push token registered.
 *
 * Do not import the `expo-notifications` package barrel. That entry loads
 * DevicePushTokenAutoRegistration.fx, which calls addPushTokenListener at
 * module init and throws on Android Expo Go from SDK 53.
 *
 * Remote push uses src/lib/push-token.ts + profile_push_tokens. Web push is
 * out of scope: on iOS, browser push requires Home Screen install first.
 * https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
 */
export { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
export { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
export { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
export {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
export { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
export { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
export { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
export { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
export type { NotificationTriggerInput } from 'expo-notifications/build/Notifications.types';
