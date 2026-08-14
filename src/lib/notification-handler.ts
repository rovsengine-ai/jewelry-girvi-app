import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Required for a scheduled/local notification to appear while the app is
 * foregrounded. SDK 57 handler fields: shouldShowBanner + shouldShowList
 * (not the older shouldShowAlert).
 * https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
 */
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
