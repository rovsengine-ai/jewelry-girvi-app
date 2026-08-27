/**
 * Web: no Expo push token registration.
 *
 * Web push is out of scope for this turn. On iOS, browser push requires the
 * site to be installed to the Home Screen first, which most customers will not
 * do. Native apps register via push-token.ts instead.
 *
 * https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
 */

export type NativePushPlatform = 'ios' | 'android';

export type ExpoPushRegistration = {
  token: string;
  platform: NativePushPlatform;
};

export async function getNativeExpoPushRegistration(): Promise<ExpoPushRegistration | null> {
  return null;
}
