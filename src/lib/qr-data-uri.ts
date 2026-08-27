/**
 * SVG data-URI QR for expo-print HTML. Pure JS — no remote images.
 * On-screen rendering uses react-native-qrcode-svg (see TokenQr).
 */
import QRCode from 'qrcode';

export async function qrCodeSvgDataUri(value: string, sizePx: number): Promise<string> {
  const svg = await QRCode.toString(value, {
    type: 'svg',
    margin: 1,
    width: sizePx,
    errorCorrectionLevel: 'M',
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
