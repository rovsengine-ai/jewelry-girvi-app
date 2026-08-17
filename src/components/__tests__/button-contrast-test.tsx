import { render } from '@testing-library/react-native';

import { Button } from '@/components/button';
import { Colors } from '@/constants/theme';
import { flatStyle } from '@/test-utils/flat-style';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
}));

/** Relative luminance for WCAG contrast (sRGB). */
function luminance(hex: string): number {
  const cleaned = hex.replace('#', '');
  const r = Number.parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = Number.parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = Number.parseInt(cleaned.slice(4, 6), 16) / 255;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('primary Button contrast', () => {
  test('light and dark primary fill vs onPrimary meet WCAG AA body (4.5:1)', () => {
    expect(contrastRatio(Colors.light.onPrimary, Colors.light.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(Colors.dark.onPrimary, Colors.dark.primary)).toBeGreaterThanOrEqual(4.5);
  });

  test('Send OTP-style primary paints primary fill and onPrimary label', async () => {
    const { getByTestId, getByText } = await render(
      <Button testID="login-send-otp" label="Send OTP" />,
    );
    expect(flatStyle(getByTestId('login-send-otp-surface'))).toMatchObject({
      backgroundColor: Colors.light.primary,
    });
    expect(flatStyle(getByText('Send OTP'))).toMatchObject({
      color: Colors.light.onPrimary,
    });
  });

  test('Save defaults-style primary is not grey-on-grey', async () => {
    const { getByTestId, getByText } = await render(
      <Button testID="save-shop-defaults" label="Save defaults" />,
    );
    const surface = flatStyle(getByTestId('save-shop-defaults-surface')) as {
      backgroundColor?: string;
    };
    const label = flatStyle(getByText('Save defaults')) as { color?: string };
    expect(surface.backgroundColor).toBe(Colors.light.primary);
    expect(label.color).toBe(Colors.light.onPrimary);
    expect(surface.backgroundColor).not.toBe(Colors.light.background);
    expect(surface.backgroundColor).not.toBe(Colors.light.surfaceSunken);
  });
});
