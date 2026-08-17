/**
 * Shrink pledged-item stills before storage upload.
 * Smallest useful JPEG: low width + high JPEG compression (compress closer to 0).
 *
 * https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const ITEM_PHOTO_MAX_WIDTH = 480;
/** 0 = highest compression / lowest quality (Expo SaveOptions). */
const ITEM_PHOTO_JPEG_QUALITY = 0.1;

export type PreparedItemPhoto = {
  uri: string;
  mimeType: 'image/jpeg';
};

export async function prepareItemPhoto(localImageUri: string): Promise<PreparedItemPhoto> {
  const context = ImageManipulator.manipulate(localImageUri);
  context.resize({ width: ITEM_PHOTO_MAX_WIDTH });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: ITEM_PHOTO_JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  return {
    uri: saved.uri,
    mimeType: 'image/jpeg',
  };
}
