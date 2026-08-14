import * as ImagePicker from 'expo-image-picker';

/**
 * DOC GATE (Expo SDK 57):
 * https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/
 * package: expo-image-picker  last-modified: August 12, 2026
 *
 * mediaTypes uses the v57 array form (`['images']`), not deprecated MediaTypeOptions.
 */
export async function pickStillImage(
  source: 'camera' | 'library',
): Promise<string | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera permission is required to photograph the item or ID.');
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled) {
      return null;
    }
    return result.assets[0]?.uri ?? null;
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to attach an existing picture.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  if (result.canceled) {
    return null;
  }
  return result.assets[0]?.uri ?? null;
}
