import type { OcrExtractionResult } from '@/types/database';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const EXTRACTION_PROMPT = `You are an OCR assistant for Indian jewelry pawn (girvi) shop handwritten receipt pads.
Extract all fields from the receipt image and respond with ONLY valid JSON (no markdown fences) using this exact shape:
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

export async function extractReceiptData(imageUrl: string): Promise<OcrExtractionResult> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_OPENAI_API_KEY is not configured.');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI Vision API failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI Vision API returned an empty response.');
  }

  return parseJsonFromContent(content);
}
