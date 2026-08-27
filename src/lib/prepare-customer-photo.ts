/**
 * Compress a face photo before upload to the private kyc bucket.
 *
 * https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const CUSTOMER_PHOTO_MAX_WIDTH = 512;
const CUSTOMER_PHOTO_JPEG_QUALITY = 0.82;

export type PreparedCustomerPhoto = {
  uri: string;
  mimeType: 'image/jpeg';
};

export async function prepareCustomerPhoto(localImageUri: string): Promise<PreparedCustomerPhoto> {
  const context = ImageManipulator.manipulate(localImageUri);
  context.resize({ width: CUSTOMER_PHOTO_MAX_WIDTH });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: CUSTOMER_PHOTO_JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  return {
    uri: saved.uri,
    mimeType: 'image/jpeg',
  };
}
