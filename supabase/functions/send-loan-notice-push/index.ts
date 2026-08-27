import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * After generate_loan_notices, claim pending rows and send Expo pushes.
 * Idempotent: claim_pending_loan_notice_pushes sets push_sent_at; a retry
 * sees those rows already claimed and does not double-send.
 *
 * No SMS/WhatsApp. Web push is out of scope: on iOS, browser push requires
 * the site to be added to the Home Screen first, which most customers will
 * not do — native Expo push tokens only.
 *
 * Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ClaimedNotice = {
  notice_id: string;
  loan_id: string;
  customer_id: string;
  notice_type: string;
  serial_number: string;
  expo_push_tokens: string[] | null;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function noticeCopy(noticeType: string, serial: string): { title: string; body: string } {
  switch (noticeType) {
    case 'due_soon':
      return {
        title: 'Girvi due soon',
        body: `Receipt ${serial} is due within 15 days. Open the app for details.`,
      };
    case 'overdue':
      return {
        title: 'Girvi overdue',
        body: `Receipt ${serial} is past due. Open the app for details.`,
      };
    case 'renewal_offer':
      return {
        title: 'Renewal available',
        body: `Interest-only renewal may be available for receipt ${serial}.`,
      };
    case 'forfeiture_warning':
      return {
        title: 'Forfeiture warning',
        body: `Receipt ${serial} has been overdue for 30+ days. Contact the shop.`,
      };
    default:
      return {
        title: 'Girvi update',
        body: `There is an update for receipt ${serial}.`,
      };
  }
}

async function sendExpoPush(
  messages: {
    to: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }[],
): Promise<{ tickets: { id?: string; status?: string }[] }> {
  if (messages.length === 0) {
    return { tickets: [] };
  }

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Expo push HTTP ${res.status}: ${text}`);
  }

  const payload = (await res.json()) as {
    data?: { id?: string; status?: string }[] | { id?: string; status?: string };
  };
  const data = payload.data;
  const tickets = Array.isArray(data) ? data : data ? [data] : [];
  return { tickets };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'missing_authorization' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const { data: isShop, error: shopError } = await userClient.rpc('is_shop_user');
  if (shopError || !isShop) {
    return jsonResponse({ error: 'shop_only' }, 403);
  }

  let asOf: string | undefined;
  try {
    const body = (await req.json()) as { as_of?: string };
    asOf = typeof body.as_of === 'string' && body.as_of.trim() !== '' ? body.as_of.trim() : undefined;
  } catch {
    asOf = undefined;
  }

  const { data: insertedRaw, error: genError } = await userClient.rpc('generate_loan_notices', {
    p_as_of: asOf ?? undefined,
  });
  if (genError) {
    return jsonResponse({ error: genError.message }, 400);
  }
  const inserted = typeof insertedRaw === 'number' ? insertedRaw : Number(insertedRaw ?? 0);

  // Claim + token lookup with the caller's JWT (shop) via SECURITY DEFINER RPC.
  const { data: claimedRaw, error: claimError } = await userClient.rpc(
    'claim_pending_loan_notice_pushes',
    { p_limit: 100 },
  );
  if (claimError) {
    return jsonResponse({ error: claimError.message }, 400);
  }

  const claimed = (claimedRaw ?? []) as ClaimedNotice[];
  const admin = createClient(supabaseUrl, serviceKey);

  const messages: {
    to: string;
    title: string;
    body: string;
    data: Record<string, string>;
    noticeId: string;
  }[] = [];

  for (const row of claimed) {
    const tokens = (row.expo_push_tokens ?? []).filter((t) => typeof t === 'string' && t.length > 0);
    if (tokens.length === 0) {
      continue;
    }
    const copy = noticeCopy(row.notice_type, row.serial_number);
    for (const to of tokens) {
      messages.push({
        to,
        title: copy.title,
        body: copy.body,
        data: {
          noticeId: row.notice_id,
          loanId: row.loan_id,
          noticeType: row.notice_type,
        },
        noticeId: row.notice_id,
      });
    }
  }

  let ticketsSent = 0;
  try {
    const { tickets } = await sendExpoPush(
      messages.map(({ to, title, body, data }) => ({ to, title, body, data })),
    );
    ticketsSent = tickets.length;

    // Best-effort: store first ticket id per notice (service_role bypasses RLS).
    const ticketByNotice = new Map<string, string>();
    messages.forEach((msg, index) => {
      const ticketId = tickets[index]?.id;
      if (ticketId && !ticketByNotice.has(msg.noticeId)) {
        ticketByNotice.set(msg.noticeId, ticketId);
      }
    });

    for (const [noticeId, ticketId] of ticketByNotice) {
      await admin
        .from('loan_notices')
        .update({ push_ticket_id: ticketId })
        .eq('id', noticeId);
    }
  } catch (err) {
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : 'expo_push_failed',
        inserted,
        claimed: claimed.length,
        // Rows are already claimed — retry will not double-send.
        push_latched: true,
      },
      502,
    );
  }

  return jsonResponse({
    inserted,
    claimed: claimed.length,
    push_messages: messages.length,
    tickets: ticketsSent,
  });
});
