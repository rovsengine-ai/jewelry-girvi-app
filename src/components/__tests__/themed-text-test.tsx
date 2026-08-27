import { render } from '@testing-library/react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';

function flatStyle(element: { props: { style?: unknown } }) {
  const style = element.props.style;
  const parts = (Array.isArray(style) ? style : [style]).filter(Boolean) as Record<
    string,
    unknown
  >[];
  return Object.assign({}, ...parts) as Record<string, unknown>;
}

describe('<ThemedText />', () => {
  test('renders its children', async () => {
    const { getByText } = await render(<ThemedText>Total due</ThemedText>);
    getByText('Total due');
  });

  test('applies the themed text colour by default', async () => {
    const { getByText } = await render(<ThemedText>Total due</ThemedText>);
    expect(flatStyle(getByText('Total due'))).toMatchObject({ color: Colors.light.text });
  });

  test('honours an explicit themeColor', async () => {
    const { getByText } = await render(<ThemedText themeColor="textSecondary">Overdue</ThemedText>);
    expect(flatStyle(getByText('Overdue'))).toMatchObject({
      color: Colors.light.textSecondary,
    });
  });

  test('applies the default type styles', async () => {
    const { getByText } = await render(<ThemedText>Body</ThemedText>);
    expect(flatStyle(getByText('Body'))).toMatchObject({ fontSize: 16, lineHeight: 24 });
  });

  test('switches size with the type prop', async () => {
    const { getByText } = await render(<ThemedText type="title">Girvi</ThemedText>);
    expect(flatStyle(getByText('Girvi'))).toMatchObject({ fontSize: 48 });
  });

  test('caller style wins over the type style, so screens can override', async () => {
    const { getByText } = await render(
      <ThemedText type="title" style={{ fontSize: 20 }}>
        Girvi
      </ThemedText>,
    );
    expect(flatStyle(getByText('Girvi'))).toMatchObject({ fontSize: 20 });
  });

  test('forwards arbitrary Text props such as accessibility and testID', async () => {
    const { getByTestId } = await render(
      <ThemedText testID="amount" accessibilityLabel="One thousand rupees">
        ₹1,000
      </ThemedText>,
    );
    expect(getByTestId('amount').props.accessibilityLabel).toBe('One thousand rupees');
  });

  test('renders a formatted rupee string without mangling the symbol', async () => {
    const { getByText } = await render(<ThemedText>₹1,00,000.50</ThemedText>);
    getByText('₹1,00,000.50');
  });
});
