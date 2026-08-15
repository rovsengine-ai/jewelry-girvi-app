import { render } from '@testing-library/react-native';

import { MoneyText } from '@/components/money-text';
import { LONGEST_MONEY_PAISE } from '@/components/palette-preview';
import { formatPaiseAsInr } from '@/lib/money';
import { flatStyle } from '@/test-utils/flat-style';

describe('<MoneyText />', () => {
  test('renders through formatPaiseAsInr only', async () => {
    const { getByText } = await render(<MoneyText paise={1234567} />);
    getByText(formatPaiseAsInr(1234567));
  });

  test('uses tabular lining figures and never sets an ellipsis mode of tail', async () => {
    const { getByText } = await render(<MoneyText paise={LONGEST_MONEY_PAISE} />);
    const node = getByText(formatPaiseAsInr(LONGEST_MONEY_PAISE));
    expect(node.props.numberOfLines).toBe(1);
    expect(node.props.adjustsFontSizeToFit).toBe(true);
    expect(node.props.ellipsizeMode).toBe('clip');
    expect(flatStyle(node).fontVariant).toEqual(['tabular-nums', 'lining-nums']);
  });

  test('large size keeps tabular lining figures', async () => {
    const { getByText } = await render(<MoneyText paise={LONGEST_MONEY_PAISE} size="large" />);
    const node = getByText(formatPaiseAsInr(LONGEST_MONEY_PAISE));
    expect(flatStyle(node).fontVariant).toEqual(['tabular-nums', 'lining-nums']);
    expect(flatStyle(node).fontSize).toBe(28);
  });

  test('proves the longest realistic Indian figure', async () => {
    expect(formatPaiseAsInr(LONGEST_MONEY_PAISE)).toBe('₹99,99,99,999.99');
    const { getByText } = await render(<MoneyText paise={LONGEST_MONEY_PAISE} />);
    getByText('₹99,99,99,999.99');
  });
});
