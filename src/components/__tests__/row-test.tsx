import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Row } from '@/components/row';
import { flatStyle } from '@/test-utils/flat-style';

describe('<Row />', () => {
  test('lays children out horizontally with a 44pt minimum hit area', async () => {
    const { getByText, getByTestId } = await render(
      <Row testID="row">
        <Text>Serial</Text>
        <Text>Status</Text>
      </Row>,
    );
    getByText('Serial');
    getByText('Status');
    expect(flatStyle(getByTestId('row'))).toMatchObject({
      flexDirection: 'row',
      minHeight: 44,
    });
  });
});
