import { render } from '@testing-library/react-native';

import { FormNotice } from '@/components/form-notice';

describe('<FormNotice />', () => {
  test('renders an error alert and skips the success notice', async () => {
    const { getByTestId, queryByTestId } = await render(
      <FormNotice error="Could not save." notice="Saved." />,
    );
    expect(getByTestId('screen-error').props.children).toBe('Could not save.');
    expect(queryByTestId('screen-notice')).toBeNull();
  });

  test('renders a success notice when there is no error', async () => {
    const { getByTestId } = await render(<FormNotice notice="OTP sent." />);
    expect(getByTestId('screen-notice').props.children).toBe('OTP sent.');
  });

  test('renders nothing when both are empty', async () => {
    const { toJSON } = await render(<FormNotice />);
    expect(toJSON()).toBeNull();
  });
});
