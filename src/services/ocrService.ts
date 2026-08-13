import * as FileSystem from 'expo-file-system/legacy';

import type { OcrExtractionResult } from '@/types/database';

const MOONSHOT_API_URL = 'https://api.moonshot.ai/v1/chat/completions';
const KIMI_VISION_MODEL = 'kimi-k3';

const EXTRACTION_PROMPT = `You are an OCR assistant for Indian jewelry pawn (girvi) shop handwritten receipt pads.
Extract all fields from the receipt image and respond with ONLY valid JSON using this exact shape:
{
  "serial_number": "string",
  "date": "YYYY-MM-DD or empty string",
  "customer_name": "string",
  "phone_number": "digits only with optional +91 prefix",
  "address": "string",
  "item_name": "string",
  "weight_grams": number,
  "loan_amount": number,
  "interest_rate": number
}
Use 0 for missing numeric fields. Use empty string for missing text fields.
interest_rate is the monthly percentage (e.g. 3 or 4, not 0.03).`;

const RECEIPT_JSON_SCHEMA = {
  name: 'girvi_receipt',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      serial_number: { type: 'string' },
      date: { type: 'string' },
      customer_name: { type: 'string' },
      phone_number: { type: 'string' },
      address: { type: 'string' },
      item_name: { type: 'string' },
      weight_grams: { type: 'number' },
      loan_amount: { type: 'number' },
      interest_rate: { type: 'number' },
    },
    required: [
      'serial_number',
      'date',
      'customer_name',
      'phone_number',
      'address',
      'item_name',
      'weight_grams',
      'loan_amount',
      'interest_rate',
    ],
    additionalProperties: false,
  },
} as const;

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

function parseJsonFromContent(content: string): OcrExtractionResult {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('OCR response did not contain JSON.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<OcrExtractionResult>;

  return {
    serial_number: String(parsed.serial_number ?? ''),
    date: String(parsed.date ?? ''),
    customer_name: String(parsed.customer_name ?? ''),
    phone_number: String(parsed.phone_number ?? ''),
    address: String(parsed.address ?? ''),
    item_name: String(parsed.item_name ?? ''),
    weight_grams: Number(parsed.weight_grams ?? 0),
    loan_amount: Number(parsed.loan_amount ?? 0),
    interest_rate: Number(parsed.interest_rate ?? 3),
  };
}

/**
 * Extract girvi receipt fields via Moonshot Kimi K3 vision.
 * Kimi does not accept public HTTP image URLs — pass a local file URI (camera/cache).
 */
export async function extractReceiptData(localImageUri: string): Promise<OcrExtractionResult> {
  const apiKey = process.env.EXPO_PUBLIC_MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_MOONSHOT_API_KEY is not configured.');
  }

  const base64 = await FileSystem.readAsStringAsync(localImageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mimeType = mimeTypeFromUri(localImageUri);
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await fetch(MOONSHOT_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: KIMI_VISION_MODEL,
      reasoning_effort: 'low',
      max_completion_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: RECEIPT_JSON_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Kimi K3 Vision API failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Kimi K3 Vision API returned an empty response.');
  }

  return parseJsonFromContent(content);
}
