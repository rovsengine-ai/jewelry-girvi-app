import {
  ANDROID_PACKAGE_NAME,
  androidAppLinkIntentUrl,
  decideQrRedirect,
  isAndroidUserAgent,
  isOpaqueToken,
  resolveAndroidFallbackUrl,
  shouldServeWebShell,
  webFallbackUrl,
} from '../qr-redirect';

describe('qr-redirect', () => {
  test('isOpaqueToken rejects empty, long, and path-like values', () => {
    expect(isOpaqueToken('abc')).toBe(true);
    expect(isOpaqueToken('')).toBe(false);
    expect(isOpaqueToken('a/b')).toBe(false);
    expect(isOpaqueToken('../x')).toBe(false);
    expect(isOpaqueToken('x'.repeat(257))).toBe(false);
  });

  test('isAndroidUserAgent is a loose hint', () => {
    expect(isAndroidUserAgent('Mozilla/5.0 (Linux; Android 14)')).toBe(true);
    expect(isAndroidUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(false);
    expect(isAndroidUserAgent(null)).toBe(false);
  });

  test('open=web forces SPA even on Android UA', () => {
    const params = new URLSearchParams('open=web');
    expect(
      shouldServeWebShell({
        userAgent: 'Mozilla/5.0 (Linux; Android 14)',
        searchParams: params,
      }),
    ).toBe(true);
  });

  test('android fallback defaults to web dashboard with open=web', () => {
    const url = resolveAndroidFallbackUrl('https://girvi.example', 'g', 'tok');
    expect(url).toBe('https://girvi.example/g/tok?open=web');
  });

  test('android fallback uses Play Store constant when set', () => {
    const play = 'https://play.google.com/store/apps/details?id=com.girvisewa.app';
    expect(resolveAndroidFallbackUrl('https://girvi.example', 'a', 'tok', play)).toBe(play);
  });

  test('intent URL preserves token path and package', () => {
    const intent = androidAppLinkIntentUrl({
      host: 'girvi.example',
      kind: 'a',
      token: 'login_tok',
      fallbackUrl: webFallbackUrl('https://girvi.example', 'a', 'login_tok'),
    });
    expect(intent).toContain('intent://girvi.example/a/login_tok#Intent');
    expect(intent).toContain(`package=${ANDROID_PACKAGE_NAME}`);
    expect(intent).toContain('scheme=https');
    expect(intent).toContain(encodeURIComponent('https://girvi.example/a/login_tok?open=web'));
  });

  test('decideQrRedirect: desktop → spa, Android → intent', () => {
    const desktop = decideQrRedirect({
      kind: 'g',
      token: 'pub',
      origin: 'https://girvi.example',
      host: 'girvi.example',
      userAgent: 'Mozilla/5.0 (Macintosh)',
      searchParams: new URLSearchParams(),
    });
    expect(desktop).toEqual({ type: 'spa' });

    const android = decideQrRedirect({
      kind: 'g',
      token: 'pub',
      origin: 'https://girvi.example',
      host: 'girvi.example',
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      searchParams: new URLSearchParams(),
    });
    expect(android.type).toBe('intent');
    if (android.type === 'intent') {
      expect(android.location).toContain('/g/pub');
    }
  });
});
