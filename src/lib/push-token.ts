/**
 * Native Expo push token registration.
 *
 * Imports getExpoPushTokenAsync from a deep path (not the package barrel) so we
 * do not load DevicePushTokenAutoRegistration.fx — that module throws in
 * Android Expo Go from SDK 53.
 *
 * Web push is out of scope: on iOS, browser push requires the site to be
 * installed to the Home Screen first, which most customers will not do.
 * See push-token.web.ts.
 *
 * https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
 * https://docs.expo.dev/push-notifications/push-notifications-setup/
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getExpoPushTokenAsync } from 'expo-notifications/build/getExpoPushTokenAsync';

import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from '@/lib/local-notifications';

export type NativePushPlatform = 'ios' | 'android';

export type ExpoPushRegistration = {
  token: string;
  platform: NativePushPlatform;
};

function easProjectId(): string | undefined {
  const fromEas = Constants.easConfig?.projectId;
  if (typeof fromEas === 'string' && fromEas.length > 0) return fromEas;
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;
  return undefined;
}

/** Returns null on web, simulators without push, or when permission is denied. */
export async function getNativeExpoPushRegistration(): Promise<ExpoPushRegistration | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return null;
  }

  if (!Device.isDevice) {
    return null;
  }

  const existing = await getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    return null;
  }

  const projectId = easProjectId();
  if (!projectId) {
    console.warn('Expo push: missing EAS projectId; skip token registration');
    return null;
  }

  const result = await getExpoPushTokenAsync({ projectId });
  const token = result.data?.trim() ?? '';
  if (token.length < 16) {
    return null;
  }

  return {
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}
