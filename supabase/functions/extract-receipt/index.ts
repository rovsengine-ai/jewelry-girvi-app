import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MOONSHOT_API_URL = 'https://api.moonshot.ai/v1/chat/completions';
const KIMI_VISION_MODEL = 'kimi-k3';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseJsonFromContent(content: string): OcrFields {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('OCR response did not contain JSON.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<OcrFields>;
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
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
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

    const apiKey = Deno.env.get('MOONSHOT_API_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'MOONSHOT_API_KEY is not configured' }, 500);
    }

    const body = (await req.json()) as {
      image_base64?: string;
      mime_type?: string;
    };

    const imageBase64 = body.image_base64?.trim();
    if (!imageBase64) {
      return jsonResponse({ error: 'image_base64 is required' }, 400);
    }

    const mimeType = body.mime_type?.trim() || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    const moonshotResponse = await fetch(MOONSHOT_API_URL, {
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

    if (!moonshotResponse.ok) {
      const errorBody = await moonshotResponse.text();
      return jsonResponse(
        { error: `Kimi Vision failed (${moonshotResponse.status}): ${errorBody}` },
        502,
      );
    }

    const payload = (await moonshotResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return jsonResponse({ error: 'Kimi Vision returned an empty response' }, 502);
    }

    return jsonResponse(parseJsonFromContent(content));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
