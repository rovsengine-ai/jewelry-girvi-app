import { fitQrSize } from '@/lib/fit-qr-size';

describe('fitQrSize', () => {
  test('keeps the preferred size on wide screens', () => {
    expect(fitQrSize(400, 240, 64)).toBe(240);
  });

  test('shrinks when the viewport is narrower than the preferred QR', () => {
    expect(fitQrSize(200, 240, 64)).toBe(136);
  });

  test('never drops below 120', () => {
    expect(fitQrSize(80, 240, 64)).toBe(120);
  });
});
