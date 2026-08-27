import { render } from '@testing-library/react-native';

import { Field } from '@/components/field';
import { Colors } from '@/constants/theme';
import { flatStyle } from '@/test-utils/flat-style';

describe('<Field />', () => {
  test('renders the label and the typed value', async () => {
    const { getByLabelText, getByText } = await render(
      <Field label="Principal (₹)" value="50000" onChangeText={() => undefined} />,
    );
    getByText('Principal (₹)');
    expect(getByLabelText('Principal (₹)').props.value).toBe('50000');
  });

  test('shows an error and paints the border with danger', async () => {
    const { getByText, getByLabelText } = await render(
      <Field label="OTP" value="" error="Enter the code from SMS." />,
    );
    getByText('Enter the code from SMS.');
    expect(flatStyle(getByLabelText('OTP'))).toMatchObject({
      borderColor: Colors.light.danger,
      minHeight: 44,
    });
  });

  test('hides the error when none is passed', async () => {
    const { queryByText } = await render(<Field label="OTP" value="123456" />);
    expect(queryByText('Enter the code from SMS.')).toBeNull();
  });
});
