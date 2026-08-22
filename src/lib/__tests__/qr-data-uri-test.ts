import { qrCodeSvgDataUri } from '@/lib/qr-data-uri';

describe('qrCodeSvgDataUri', () => {
  test('embeds only the given URL payload as an SVG data-URI', async () => {
    const url = 'https://girvi.example/g/opaque-token-only';
    const dataUri = await qrCodeSvgDataUri(url, 128);
    expect(dataUri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodeURIComponent(dataUri.replace('data:image/svg+xml;charset=utf-8,', ''));
    expect(svg).toContain('<svg');
    expect(dataUri).not.toContain('9000000003');
    expect(dataUri).not.toContain('serial');
    expect(dataUri).not.toContain('Asha');
  });
});
