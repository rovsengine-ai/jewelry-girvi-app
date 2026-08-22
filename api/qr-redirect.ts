/**
 * Vercel Edge Function: GET /g/:token and GET /a/:token (via vercel.json rewrites).
 * No DB. Cache-Control: no-store (activation tokens are single-use).
 */

import {
  CACHE_CONTROL_NO_STORE,
  decideQrRedirect,
  isOpaqueToken,
  type QrKind,
} from './lib/qr-redirect';

export const config = {
  runtime: 'edge',
};

function parseKind(raw: string | null): QrKind | null {
  if (raw === 'g' || raw === 'a') return raw;
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Cache-Control': CACHE_CONTROL_NO_STORE },
    });
  }

  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get('kind'));
  const token = url.searchParams.get('token') ?? '';

  if (!kind || !isOpaqueToken(token)) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Cache-Control': CACHE_CONTROL_NO_STORE },
    });
  }

  const userAgent = request.headers.get('user-agent');
  const decision = decideQrRedirect({
    kind,
    token,
    origin: url.origin,
    host: url.host,
    userAgent,
    searchParams: url.searchParams,
  });

  if (decision.type === 'intent') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: decision.location,
        'Cache-Control': CACHE_CONTROL_NO_STORE,
      },
    });
  }

  // Serve the Expo web shell so client routing sees /g/:token or /a/:token.
  const indexUrl = new URL('/', url.origin);
  const indexRes = await fetch(indexUrl, {
    headers: { Accept: 'text/html' },
  });
  const html = await indexRes.text();
  return new Response(request.method === 'HEAD' ? null : html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': CACHE_CONTROL_NO_STORE,
    },
  });
}
