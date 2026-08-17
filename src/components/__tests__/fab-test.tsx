import { render } from '@testing-library/react-native';

import { Fab } from '@/components/fab';
import { Colors, Sizes, Spacing } from '@/constants/theme';
import { flatStyle } from '@/test-utils/flat-style';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-symbols', () => ({
  SymbolView: 'SymbolView',
}));

describe('Fab', () => {
  test('anchors bottom-right outside PressableScale so absolute layout is not dropped', async () => {
    const { getByTestId } = await render(
      <Fab
        testID="loans-add-fab"
        accessibilityLabel="Scan a pledge"
        bottom={Spacing.three}
        onPress={() => undefined}
      />,
    );

    expect(flatStyle(getByTestId('loans-add-fab-anchor'))).toMatchObject({
      position: 'absolute',
      right: Spacing.four,
      bottom: Spacing.three,
    });
    expect(flatStyle(getByTestId('loans-add-fab-surface'))).toMatchObject({
      backgroundColor: Colors.light.primary,
      width: Sizes.fab,
      height: Sizes.fab,
    });
  });
});
