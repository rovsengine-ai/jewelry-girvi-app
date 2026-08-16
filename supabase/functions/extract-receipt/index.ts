import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DEFAULT_MOONSHOT_API_BASE = 'https://api.moonshot.ai/v1';
/** Free-tier multimodal model — see https://ai.google.dev/gemini-api/docs/models */
const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
/** Vision + reasoning; see https://platform.moonshot.ai/docs/guide/use-kimi-vision-model */
const DEFAULT_KIMI_VISION_MODEL = 'kimi-k3';
const UPSTREAM_DETAIL_MAX = 200;

function moonshotChatCompletionsUrl(): string {
  const base = Deno.env.get('MOONSHOT_API_BASE_URL')?.trim().replace(/\/+$/, '') ||
    DEFAULT_MOONSHOT_API_BASE;
  return `${base}/chat/completions`;
}

function kimiVisionModel(): string {
  return Deno.env.get('MOONSHOT_MODEL')?.trim() || DEFAULT_KIMI_VISION_MODEL;
}

function geminiModel(): string {
  return Deno.env.get('GEMINI_MODEL')?.trim() || DEFAULT_GEMINI_MODEL;
}

function geminiGenerateContentUrl(model: string): string {
  const encoded = encodeURIComponent(model);
  return `https://generativelanguage.googleapis.com/v1beta/models/${encoded}:generateContent`;
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXTRACTION_PROMPT = `You are an OCR assistant for Indian jewelry pawn (girvi) shop handwritten "आंकलन" (assessment) receipt pads.

Pad layout (typical):
- Orange/maroon header bar with white Hindi title आंकलन. Ignore large "AK" watermark.
- Labels mix Hindi + English: क्रम सं० / serial, Name, Date.
- Handwriting is mostly Devanagari (names, ornaments, addresses) but English digits and labels also appear. Keep Hindi strings in the ORIGINAL Devanagari script — do NOT transliterate to Latin. English names stay Latin.
- Phone and address are often missing — empty string is correct.
- Amounts look like 100000/-, 1000/, 5000/- or Hindi words (एक हजार रुपये मात्र). loan_amount must be the RUPEES number only (100000, 1000, 5000) — never paise. If only Hindi words are present and you can convert confidently, do so; else 0.
- Weights: 25|800mg means 25 grams + 800 mg = 25.8 grams; 47 gm means 47. Always output weight_grams as a number in GRAMS.
- Interest like "50/- प्रतिमाह" may be ₹ per month OR a percent. If ambiguous, set interest_rate to 0 (never invent compound interest). Only set a positive interest_rate when clearly a monthly PERCENT (e.g. 3%, 2.5).
- Dates: 21|1|25, 30/10/23, 08/10/2022 → normalize to YYYY-MM-DD when confident; else "".
- Items: सोना पेठा, पायल, etc. Put the ornament phrase in item_name as written.

Respond with ONLY valid JSON using this exact shape:
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
interest_rate is monthly percent when known (e.g. 3), else 0.`;

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

/** Gemini generateContent responseSchema (OpenAPI subset). */
const GEMINI_RECEIPT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    serial_number: { type: 'STRING' },
    date: { type: 'STRING' },
    customer_name: { type: 'STRING' },
    phone_number: { type: 'STRING' },
    address: { type: 'STRING' },
    item_name: { type: 'STRING' },
    weight_grams: { type: 'NUMBER' },
    loan_amount: { type: 'NUMBER' },
    interest_rate: { type: 'NUMBER' },
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
} as const;

type OcrFields = {
  serial_number: string;
  date: string;
  customer_name: string;
  phone_number: string;
  address: string;
  item_name: string;
  weight_grams: number;
  loan_amount: number;
  interest_rate: number;
};

type EdgeErrorCode = 'misconfigured' | 'provider_rejected' | 'upstream' | 'bad_request';

type EdgeErrorBody = {
  error: string;
  code?: EdgeErrorCode;
  upstream_status?: number;
  upstream_detail?: string;
};

type OcrProvider = 'gemini' | 'moonshot';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function truncateDetail(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= UPSTREAM_DETAIL_MAX) return trimmed;
  return `${trimmed.slice(0, UPSTREAM_DETAIL_MAX)}…`;
}

function resolveOcrProvider(): { provider: OcrProvider; apiKey: string } | null {
  const geminiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (geminiKey) return { provider: 'gemini', apiKey: geminiKey };

  const moonshotKey = Deno.env.get('MOONSHOT_API_KEY')?.trim();
  if (moonshotKey) return { provider: 'moonshot', apiKey: moonshotKey };

  return null;
}

function isProviderAuthFailure(upstreamStatus: number, upstreamBody: string): boolean {
  const lower = upstreamBody.toLowerCase();
  if (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('incorrect_api_key') ||
    lower.includes('invalid_authentication') ||
    lower.includes('invalid authentication') ||
    (lower.includes('permission_denied') && lower.includes('api key'))
  ) {
    return true;
  }
  return upstreamStatus === 401;
}

function misconfiguredResponse(upstreamBody?: string): Response {
  const body: EdgeErrorBody = {
    error:
      'OCR key is missing or invalid. Prefer GEMINI_API_KEY from https://aistudio.google.com/apikey (free tier). Or use MOONSHOT_API_KEY from platform.kimi.ai with billing.',
    code: 'misconfigured',
    upstream_status: 401,
    upstream_detail: upstreamBody ? truncateDetail(upstreamBody) : undefined,
  };
  return jsonResponse(body, 500);
}

function providerRejectedResponse(upstreamStatus: number, upstreamBody: string): Response {
  if (isProviderAuthFailure(upstreamStatus, upstreamBody)) {
    return misconfiguredResponse(upstreamBody);
  }
  const detail = truncateDetail(upstreamBody);
  const body: EdgeErrorBody = {
    error: 'OCR provider rejected the request',
    code: 'provider_rejected',
    upstream_status: upstreamStatus,
    upstream_detail: detail,
  };
  const status = upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
  return jsonResponse(body, status);
}

function normalizeWeightGrams(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== 'string') return 0;
  const trimmed = raw.trim().toLowerCase().replace(/,/g, '');
  const pipeMg = trimmed.match(/^(\d+)\s*[|／/]\s*(\d{1,3})\s*mg$/);
  if (pipeMg) {
    return Number.parseInt(pipeMg[1], 10) + Number.parseInt(pipeMg[2].padStart(3, '0').slice(0, 3), 10) / 1000;
  }
  const onlyMg = trimmed.match(/^(\d+)\s*mg$/);
  if (onlyMg) return Number.parseInt(onlyMg[1], 10) / 1000;
  const grams = trimmed.match(/^(\d+(?:\.\d{1,3})?)/);
  if (grams) {
    const value = Number.parseFloat(grams[1]);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  return 0;
}

function normalizeLoanAmount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  if (typeof raw !== 'string') return 0;
  const cleaned = raw
    .trim()
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/\/-?\s*$/, '')
    .replace(/₹/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return 0;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function normalizeDate(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split(/[|/.\-]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 3) return '';
  const a = Number.parseInt(parts[0], 10);
  const b = Number.parseInt(parts[1], 10);
  const c = Number.parseInt(parts[2], 10);
  if (![a, b, c].every((n) => Number.isInteger(n))) return '';
  let day: number;
  let month: number;
  let year: number;
  if (parts[0].length === 4) {
    year = a;
    month = b;
    day = c;
  } else {
    day = a;
    month = b;
    year = c < 100 ? (c >= 70 ? 1900 + c : 2000 + c) : c;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseJsonFromContent(content: string): OcrFields {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('OCR response did not contain JSON.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<OcrFields> & Record<string, unknown>;
  const interestRaw = Number(parsed.interest_rate ?? 0);
  const interest_rate =
    Number.isFinite(interestRaw) && interestRaw > 0 && interestRaw <= 20 ? interestRaw : 0;

  return {
    serial_number: String(parsed.serial_number ?? ''),
    date: normalizeDate(parsed.date),
    customer_name: String(parsed.customer_name ?? ''),
    phone_number: String(parsed.phone_number ?? ''),
    address: String(parsed.address ?? ''),
    item_name: String(parsed.item_name ?? ''),
    weight_grams: normalizeWeightGrams(parsed.weight_grams),
    loan_amount: normalizeLoanAmount(parsed.loan_amount),
    interest_rate,
  };
}

function shouldRetryWithJsonObject(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes('json_schema') ||
    lower.includes('response_format') ||
    lower.includes('structured output')
  );
}

async function callMoonshot(
  apiKey: string,
  dataUrl: string,
  responseFormat: { type: 'json_schema'; json_schema: typeof RECEIPT_JSON_SCHEMA } | { type: 'json_object' },
): Promise<Response> {
  return fetch(moonshotChatCompletionsUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: kimiVisionModel(),
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
      response_format: responseFormat,
    }),
  });
}

async function callGemini(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
): Promise<Response> {
  return fetch(geminiGenerateContentUrl(geminiModel()), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: EXTRACTION_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RECEIPT_SCHEMA,
        temperature: 0.1,
      },
    }),
  });
}

function extractGeminiText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const first = candidates[0];
  if (!first || typeof first !== 'object') return null;
  const content = (first as { content?: unknown }).content;
  if (!content || typeof content !== 'object') return null;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return null;
  const texts: string[] = [];
  for (const part of parts) {
    if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
      texts.push((part as { text: string }).text);
    }
  }
  const joined = texts.join('').trim();
  return joined.length > 0 ? joined : null;
}

async function runMoonshotOcr(apiKey: string, dataUrl: string): Promise<Response> {
  let moonshotResponse = await callMoonshot(apiKey, dataUrl, {
    type: 'json_schema',
    json_schema: RECEIPT_JSON_SCHEMA,
  });

  if (!moonshotResponse.ok) {
    const errorBody = await moonshotResponse.text();
    if (shouldRetryWithJsonObject(moonshotResponse.status, errorBody)) {
      moonshotResponse = await callMoonshot(apiKey, dataUrl, { type: 'json_object' });
      if (!moonshotResponse.ok) {
        const retryBody = await moonshotResponse.text();
        return providerRejectedResponse(moonshotResponse.status, retryBody);
      }
    } else {
      return providerRejectedResponse(moonshotResponse.status, errorBody);
    }
  }

  const payload = (await moonshotResponse.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return jsonResponse({ error: 'Kimi Vision returned an empty response', code: 'upstream' }, 502);
  }

  return jsonResponse(parseJsonFromContent(content));
}

async function runGeminiOcr(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
): Promise<Response> {
  const geminiResponse = await callGemini(apiKey, imageBase64, mimeType);
  if (!geminiResponse.ok) {
    const errorBody = await geminiResponse.text();
    return providerRejectedResponse(geminiResponse.status, errorBody);
  }

  const payload: unknown = await geminiResponse.json();
  const content = extractGeminiText(payload);
  if (!content) {
    const blockReason =
      payload &&
      typeof payload === 'object' &&
      (payload as { promptFeedback?: { blockReason?: string } }).promptFeedback?.blockReason;
    return jsonResponse(
      {
        error: blockReason
          ? `Gemini blocked the image (${blockReason})`
          : 'Gemini returned an empty response',
        code: 'upstream',
      },
      502,
    );
  }

  return jsonResponse(parseJsonFromContent(content));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header', code: 'bad_request' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: 'Server misconfigured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile || (profile.role !== 'owner' && profile.role !== 'staff')) {
      return jsonResponse({ error: 'Forbidden: shop users only' }, 403);
    }

    const resolved = resolveOcrProvider();
    if (!resolved) {
      return jsonResponse(
        {
          error:
            'No OCR key configured. Set GEMINI_API_KEY (recommended free) or MOONSHOT_API_KEY in supabase/functions/.env',
          code: 'misconfigured',
        },
        500,
      );
    }

    const body = (await req.json()) as {
      image_base64?: string;
      mime_type?: string;
    };

    const imageBase64 = body.image_base64?.trim();
    if (!imageBase64) {
      return jsonResponse({ error: 'image_base64 is required', code: 'bad_request' }, 400);
    }

    const mimeType = body.mime_type?.trim() || 'image/jpeg';

    if (resolved.provider === 'gemini') {
      return await runGeminiOcr(resolved.apiKey, imageBase64, mimeType);
    }

    const dataUrl = `data:${mimeType};base64,${imageBase64}`;
    return await runMoonshotOcr(resolved.apiKey, dataUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message, code: 'upstream' }, 500);
  }
});
