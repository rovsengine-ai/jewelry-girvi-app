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
        ? Colors.light.statusActive
        : status === 'redeemed'
          ? Colors.light.statusRedeemed
          : status === 'closed'
            ? Colors.light.statusClosed
            : Colors.light.statusDefaulted;
    expect(flatStyle(getByTestId('badge'))).toMatchObject({
      backgroundColor: token,
    });
  });
});
