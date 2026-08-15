import { render } from '@testing-library/react-native';

import { Badge } from '@/components/badge';
import { Colors } from '@/constants/theme';
import { flatStyle } from '@/test-utils/flat-style';
import type { LoanStatus } from '@/types/database';

const STATUSES: LoanStatus[] = ['active', 'redeemed', 'closed', 'defaulted'];

describe('<Badge />', () => {
  test.each(STATUSES)('renders a distinct token for status %s', async (status) => {
    const { getByText, getByTestId } = await render(<Badge status={status} testID="badge" />);
    getByText(status.charAt(0).toUpperCase() + status.slice(1));
    const token =
      status === 'active'
        ? Colors.light.tintSuccess
        : status === 'redeemed'
          ? Colors.light.tintRedeemed
          : status === 'closed'
            ? Colors.light.tintClosed
            : Colors.light.tintDanger;
    expect(flatStyle(getByTestId('badge'))).toMatchObject({
      backgroundColor: token,
    });
  });
});
