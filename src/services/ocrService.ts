import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/lib/supabase';
import type { OcrExtractionResult } from '@/types/database';

function mimeTypeFromUri(uri: string): string {
  const extension = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
}

/**
 * Extract girvi receipt fields via the extract-receipt Edge Function
 * (Moonshot key stays server-side).
 */
export async function extractReceiptData(localImageUri: string): Promise<OcrExtractionResult> {
  const imageBase64 = await FileSystem.readAsStringAsync(localImageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { data, error } = await supabase.functions.invoke<OcrExtractionResult>('extract-receipt', {
    body: {
      image_base64: imageBase64,
      mime_type: mimeTypeFromUri(localImageUri),
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('OCR edge function returned an empty response.');
  }

  if ('error' in data && typeof (data as { error?: string }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }

  return {
    serial_number: String(data.serial_number ?? ''),
    date: String(data.date ?? ''),
    customer_name: String(data.customer_name ?? ''),
    phone_number: String(data.phone_number ?? ''),
    address: String(data.address ?? ''),
    item_name: String(data.item_name ?? ''),
    weight_grams: Number(data.weight_grams ?? 0),
    loan_amount: Number(data.loan_amount ?? 0),
    interest_rate: Number(data.interest_rate ?? 3),
  };
}
