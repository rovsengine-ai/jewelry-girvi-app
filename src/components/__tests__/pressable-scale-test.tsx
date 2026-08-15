import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { PressableScale } from '@/components/pressable-scale';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
}));

describe('<PressableScale />', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('reduce motion keeps scale at 1 and does not spring', async () => {
    let resolveEnabled: ((value: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnabled = resolve;
        }),
    );
    const withSpring = jest.spyOn(Reanimated, 'withSpring');

    const { getByTestId } = await render(
      <PressableScale testID="press">
        <Text>Tap</Text>
      </PressableScale>,
    );

    await act(async () => {
      resolveEnabled?.(true);
    });

    await waitFor(() => {
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
    });

    withSpring.mockClear();
    fireEvent(getByTestId('press'), 'pressIn', { nativeEvent: {} });
    expect(withSpring).not.toHaveBeenCalled();
  });
});
