import { PixelRatio } from 'react-native';

import { render } from '@testing-library/react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { MoneyText } from '@/components/money-text';
import { LONGEST_MONEY_PAISE } from '@/components/palette-preview';
import { Colors, MinTouchTarget } from '@/constants/theme';
import { ThemePaletteProvider } from '@/hooks/use-theme';
import { formatPaiseAsInr } from '@/lib/money';
import { flatStyle } from '@/test-utils/flat-style';

/**
 * Named device: Google Pixel 4a (5.81", 393×851 dp).
 * OS font scale 200% (PixelRatio fontScale 2) plus dark tokens.
 * Jest cannot rasterize a real Android compositor; this asserts the
 * constraints that keep the counter usable on that device.
 */
describe('Pixel 4a 200% font / dark mode', () => {
  const previousFontScale = PixelRatio.getFontScale();

  beforeAll(() => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
  });

  afterAll(() => {
    jest.restoreAllMocks();
    expect(previousFontScale).toBeDefined();
  });

  test('money never wraps or ellipsizes at ₹99,99,99,999.99', async () => {
    const { getByText } = await render(
      <ThemePaletteProvider palette={Colors.dark}>
        <MoneyText paise={LONGEST_MONEY_PAISE} />
      </ThemePaletteProvider>,
    );
    const node = getByText(formatPaiseAsInr(LONGEST_MONEY_PAISE));
    expect(PixelRatio.getFontScale()).toBe(2);
    expect(node.props.allowFontScaling).not.toBe(false);
    expect(node.props.numberOfLines).toBe(1);
    expect(node.props.adjustsFontSizeToFit).toBe(true);
    expect(node.props.ellipsizeMode).toBe('clip');
  });

  test('primary control stays a 44pt hit target in dark mode', async () => {
    const { getByRole, getByTestId } = await render(
      <ThemePaletteProvider palette={Colors.dark}>
        <Button testID="pixel4a-primary" label="Save Girvi Loan" />
      </ThemePaletteProvider>,
    );
    expect(flatStyle(getByRole('button'))).toMatchObject({
      minHeight: MinTouchTarget,
    });
    expect(flatStyle(getByTestId('pixel4a-primary-surface'))).toMatchObject({
      backgroundColor: Colors.dark.primary,
      minHeight: MinTouchTarget,
    });
  });

  test('fields stay at least 44pt and do not disable OS scaling', async () => {
    const { getByLabelText } = await render(
      <ThemePaletteProvider palette={Colors.dark}>
        <Field label="Mobile number" value="9876543210" />
      </ThemePaletteProvider>,
    );
    const input = getByLabelText('Mobile number');
    expect(input.props.allowFontScaling).not.toBe(false);
    expect(flatStyle(input).minHeight).toBe(MinTouchTarget);
  });
});
