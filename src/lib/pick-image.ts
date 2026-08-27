import * as ImagePicker from 'expo-image-picker';

/**
 * DOC GATE (Expo SDK 57):
 * https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/
 * package: expo-image-picker  last-modified: August 12, 2026
 *
 * mediaTypes uses the v57 array form (`['images']`), not deprecated MediaTypeOptions.
 */
export class PermissionDeniedError extends Error {
  readonly kind: 'camera' | 'library';

  constructor(kind: 'camera' | 'library') {
    super(kind);
    this.name = 'PermissionDeniedError';
    this.kind = kind;
  }
}

export async function pickStillImage(
  source: 'camera' | 'library',
  options?: { quality?: number },
): Promise<string | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new PermissionDeniedError('camera');
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: options?.quality ?? 0.85,
    });
    if (result.canceled) {
      return null;
    }
    return result.assets[0]?.uri ?? null;
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PermissionDeniedError('library');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: options?.quality ?? 0.85,
  });
  if (result.canceled) {
    return null;
  }
  return result.assets[0]?.uri ?? null;
}
