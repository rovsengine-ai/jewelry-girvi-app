import { parseShopQr } from '@/lib/parse-shop-qr';

describe('parseShopQr', () => {
  test('reads receipt landing URLs', () => {
    expect(parseShopQr('https://girvi-sewa.vercel.app/g/abcToken')).toEqual({
      kind: 'loan',
      token: 'abcToken',
    });
  });

  test('reads activation URLs and percent-encoded tokens', () => {
    expect(parseShopQr('https://girvi.example/a/tok%2Fslash')).toEqual({
      kind: 'activation',
      token: 'tok/slash',
    });
  });

  test('reads path-only payloads', () => {
    expect(parseShopQr('/g/only-token')).toEqual({ kind: 'loan', token: 'only-token' });
  });

  test('rejects unrelated text', () => {
    expect(parseShopQr('serial 12')).toBeNull();
    expect(parseShopQr('')).toBeNull();
  });
});
