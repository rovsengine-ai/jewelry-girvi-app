/**
 * Shrink gallery/camera stills before Edge Function OCR.
 * Large HEIC/JPEG payloads commonly cause non-2xx from extract-receipt.
 *
 * ImageManipulator.manipulate() accepts local file:// and iOS ph:// URIs
 * returned by expo-image-picker (HEIC is decoded on save as JPEG).
 *
 * https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Keep JSON body under typical Edge Function invoke limits (~6 MB). */
const OCR_MAX_BASE64_CHARS = 4_000_000;
const OCR_MAX_WIDTH_DEFAULT = 1600;
const OCR_MAX_WIDTH_SMALL = 1200;
const OCR_JPEG_QUALITY_DEFAULT = 0.72;
const OCR_JPEG_QUALITY_SMALL = 0.6;

export class ReceiptImageTooLargeError extends Error {
  constructor() {
    super('ReceiptImageTooLarge');
    this.name = 'ReceiptImageTooLargeError';
  }
}

export type PreparedReceiptImage = {
  /** Local file used for the review thumbnail / storage upload. */
  uri: string;
  base64: string;
  mimeType: 'image/jpeg';
};

type CompressProfile = {
  maxWidth: number;
  quality: number;
};

async function compressReceipt(
  localImageUri: string,
  profile: CompressProfile,
): Promise<PreparedReceiptImage> {
  const context = ImageManipulator.manipulate(localImageUri);
  context.resize({ width: profile.maxWidth });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: profile.quality,
    format: SaveFormat.JPEG,
    base64: true,
  });

  if (!saved.base64) {
    throw new Error('Could not prepare the receipt image for scanning.');
  }

  return {
    uri: saved.uri,
    base64: saved.base64,
    mimeType: 'image/jpeg',
  };
}

export async function prepareReceiptForOcr(localImageUri: string): Promise<PreparedReceiptImage> {
  const profiles: CompressProfile[] = [
    { maxWidth: OCR_MAX_WIDTH_DEFAULT, quality: OCR_JPEG_QUALITY_DEFAULT },
    { maxWidth: OCR_MAX_WIDTH_SMALL, quality: OCR_JPEG_QUALITY_SMALL },
  ];

  for (const profile of profiles) {
    const prepared = await compressReceipt(localImageUri, profile);
    if (prepared.base64.length <= OCR_MAX_BASE64_CHARS) {
      return prepared;
    }
  }

  throw new ReceiptImageTooLargeError();
}
