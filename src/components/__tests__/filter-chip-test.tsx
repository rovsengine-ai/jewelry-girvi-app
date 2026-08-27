import { render } from '@testing-library/react-native';

import { FilterChip } from '@/components/filter-chip';
import { Colors } from '@/constants/theme';
import { flatStyle } from '@/test-utils/flat-style';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
}));

describe('FilterChip', () => {
  test('selected chip paints gold fill on the surface View', async () => {
    const { getByTestId } = await render(
      <FilterChip
        testID="status-active"
        label="Active"
        selected
        onPress={() => undefined}
      />,
    );
    expect(flatStyle(getByTestId('status-active-surface'))).toMatchObject({
      backgroundColor: Colors.light.gold,
    });
  });

  test('unselected chip paints elevated fill (not transparent bare text)', async () => {
    const { getByTestId } = await render(
      <FilterChip
        testID="status-all"
        label="All"
        selected={false}
        onPress={() => undefined}
      />,
    );
    expect(flatStyle(getByTestId('status-all-surface'))).toMatchObject({
      backgroundColor: Colors.light.elevated,
    });
  });
});
