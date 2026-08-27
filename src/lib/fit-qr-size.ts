/** Shrink QR so it stays fully visible on narrow phone viewports. */
export function fitQrSize(windowWidth: number, preferred: number, gutter = 64): number {
  const available = windowWidth - gutter;
  if (!Number.isFinite(available) || available <= 0) return preferred;
  return Math.max(120, Math.min(preferred, Math.floor(available)));
}
