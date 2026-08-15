import { fireEvent, render } from '@testing-library/react-native';

import { EmptyState } from '@/components/empty-state';

describe('<EmptyState />', () => {
  test('renders title and body', async () => {
    const { getByText } = await render(
      <EmptyState title="No loans" body="New pledges appear here." />,
    );
    getByText('No loans');
    getByText('New pledges appear here.');
  });

  test('fires the optional action', async () => {
    const onAction = jest.fn();
    const { getByRole } = await render(
      <EmptyState title="No loans" body="Empty." actionLabel="Scan receipt" onAction={onAction} />,
    );
    fireEvent.press(getByRole('button'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('omits the action when no handler is given', async () => {
    const { queryByRole } = await render(<EmptyState title="No loans" body="Empty." />);
    expect(queryByRole('button')).toBeNull();
  });
});
