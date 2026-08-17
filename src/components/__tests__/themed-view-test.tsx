import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';

function flatStyle(element: { props: { style?: unknown } }) {
  const style = element.props.style;
  const parts = (Array.isArray(style) ? style : [style]).filter(Boolean) as Record<
    string,
    unknown
  >[];
  return Object.assign({}, ...parts) as Record<string, unknown>;
}

describe('<ThemedView />', () => {
  test('renders its children', async () => {
    const { getByText } = await render(
      <ThemedView>
        <Text>Loan detail</Text>
      </ThemedView>,
    );
    getByText('Loan detail');
  });

  test('uses the themed background by default', async () => {
    const { getByTestId } = await render(<ThemedView testID="surface" />);
    expect(flatStyle(getByTestId('surface'))).toMatchObject({
      backgroundColor: Colors.light.background,
    });
  });

  test('honours the type prop for element surfaces', async () => {
    const { getByTestId } = await render(<ThemedView testID="surface" type="backgroundElement" />);
    expect(flatStyle(getByTestId('surface'))).toMatchObject({
      backgroundColor: Colors.light.backgroundElement,
    });
  });

  test('caller style can override the themed background', async () => {
    const { getByTestId } = await render(
      <ThemedView testID="surface" style={{ backgroundColor: '#ff0000' }} />,
    );
    expect(flatStyle(getByTestId('surface'))).toMatchObject({ backgroundColor: '#ff0000' });
  });

  test('FLAGGED: lightColor and darkColor props are accepted but ignored', async () => {
    // src/components/themed-view.tsx destructures lightColor/darkColor and then
    // never uses them, so a caller passing them gets the theme background with
    // no warning. Kept in the type surface, so this is silent.
    const { getByTestId } = await render(
      <ThemedView testID="surface" lightColor="#123456" darkColor="#654321" />,
    );
    expect(flatStyle(getByTestId('surface'))).toMatchObject({
      backgroundColor: Colors.light.background,
    });
  });

  test('does not leak lightColor/darkColor onto the native View props', async () => {
    const { getByTestId } = await render(<ThemedView testID="surface" lightColor="#123456" />);
    expect(getByTestId('surface').props.lightColor).toBeUndefined();
  });
});
