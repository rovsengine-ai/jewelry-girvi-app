import { fireEvent, render } from '@testing-library/react-native';

import { Button } from '@/components/button';
import { Colors } from '@/constants/theme';
import { useNetworkOptional } from '@/providers/network-provider';
import { flatStyle } from '@/test-utils/flat-style';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock('@/providers/network-provider', () => ({
  useNetworkOptional: jest.fn(() => ({ isOffline: false, isOnline: true })),
  useNetwork: jest.fn(() => ({ isOffline: false, isOnline: true })),
}));

const useNetworkOptionalMock = useNetworkOptional as jest.MockedFunction<typeof useNetworkOptional>;

describe('<Button />', () => {
  beforeEach(() => {
    useNetworkOptionalMock.mockReturnValue({ isOffline: false, isOnline: true });
  });

  test('renders the label', async () => {
    const { getByText } = await render(<Button label="Save loan" />);
    getByText('Save loan');
  });

  test('primary uses the primary token', async () => {
    const { getByRole, getByTestId } = await render(
      <Button testID="save-loan" label="Save loan" />,
    );
    expect(flatStyle(getByRole('button'))).toMatchObject({
      minHeight: 44,
    });
    expect(flatStyle(getByTestId('save-loan-surface'))).toMatchObject({
      backgroundColor: Colors.light.primary,
    });
  });

  test('primary label uses onPrimary for contrast', async () => {
    const { getByText } = await render(<Button label="Save loan" />);
    expect(flatStyle(getByText('Save loan'))).toMatchObject({
      color: Colors.light.onPrimary,
    });
  });

  test('does not fire onPress when disabled', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Button label="Save" disabled onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('shows a loading indicator and blocks press', async () => {
    const onPress = jest.fn();
    const { getByRole, queryByText } = await render(
      <Button label="Save" loading onPress={onPress} />,
    );
    expect(queryByText('Save')).toBeNull();
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
    expect(getByRole('button').props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
  });

  test('danger variant uses the danger token', async () => {
    const { getByTestId } = await render(
      <Button testID="redeem" label="Redeem" variant="danger" />,
    );
    expect(flatStyle(getByTestId('redeem-surface'))).toMatchObject({
      backgroundColor: Colors.light.danger,
    });
  });

  test('requiresNetwork disables and renames when offline', async () => {
    useNetworkOptionalMock.mockReturnValue({ isOffline: true, isOnline: false });
    const onPress = jest.fn();
    const { getByRole, getByText } = await render(
      <Button label="Save loan" requiresNetwork onPress={onPress} />,
    );
    getByText('Unavailable offline');
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
