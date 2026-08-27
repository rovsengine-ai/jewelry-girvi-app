/**
 * Read a local still into bytes for Storage upload.
 * Native file:// uses expo-file-system/legacy (not available on web).
 * Web gallery/camera URIs are data:, blob:, or https: — use fetch / data URL.
 * https://docs.expo.dev/versions/v57.0.0/sdk/filesystem-legacy/
 * https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
  return base64ToBytes(base64);
}

export async function readLocalImageBytes(localUri: string): Promise<Uint8Array> {
  if (localUri.startsWith('data:')) {
    return bytesFromDataUrl(localUri);
  }

  if (
    localUri.startsWith('blob:') ||
    localUri.startsWith('http://') ||
    localUri.startsWith('https://')
  ) {
    const response = await fetch(localUri);
    if (!response.ok) {
      throw new Error('Could not read the image.');
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  if (Platform.OS === 'web') {
    throw new Error('Could not read the image in this browser.');
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToBytes(base64);
}
