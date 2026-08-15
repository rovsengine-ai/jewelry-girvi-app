import { fireEvent, render } from '@testing-library/react-native';

import { Button } from '@/components/button';
import { Colors } from '@/constants/theme';
import { flatStyle } from '@/test-utils/flat-style';

describe('<Button />', () => {
  test('renders the label', async () => {
    const { getByText } = await render(<Button label="Save loan" />);
    getByText('Save loan');
  });

  test('primary uses the primary token', async () => {
    const { getByRole } = await render(<Button label="Save loan" />);
    expect(flatStyle(getByRole('button'))).toMatchObject({
      backgroundColor: Colors.light.primary,
      minHeight: 44,
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
    const { getByRole } = await render(<Button label="Redeem" variant="danger" />);
    expect(flatStyle(getByRole('button'))).toMatchObject({
      backgroundColor: Colors.light.danger,
    });
  });
});
