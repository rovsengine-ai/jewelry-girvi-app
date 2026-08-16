import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import { ListRow, listRowFill } from '@/components/list-row';
import { Colors } from '@/constants/theme';
import { flatStyle } from '@/test-utils/flat-style';

describe('<ListRow />', () => {
  test('renders leading, content, and trailing slots', async () => {
    const { getByText } = await render(
      <ListRow
        leading={<Text>L</Text>}
        content={<Text>C</Text>}
        trailing={<Text>T</Text>}
      />,
    );
    getByText('L');
    getByText('C');
    getByText('T');
  });

  test('draws an inset divider except on the last row', async () => {
    const { getByTestId, queryByTestId } = await render(
      <View>
        <ListRow testID="mid" content={<Text>Mid</Text>} />
        <ListRow testID="last" isLast content={<Text>Last</Text>} />
      </View>,
    );
    expect(getByTestId('mid-divider')).toBeTruthy();
    expect(queryByTestId('last-divider')).toBeNull();
  });

  test('pressed state fills backgroundSelected', async () => {
    const { getByTestId } = await render(
      <ListRow testID="row" onPress={() => undefined} content={<Text>Press</Text>} />,
    );
    const row = getByTestId('row');
    expect(flatStyle(row).backgroundColor).toBe(
      listRowFill(false, Colors.light.elevated, Colors.light.backgroundSelected),
    );
    expect(listRowFill(true, Colors.light.elevated, Colors.light.backgroundSelected)).toBe(
      Colors.light.backgroundSelected,
    );
  });
});
