import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Card } from '@/components/card';
import { Colors } from '@/constants/theme';
import { flatStyle } from '@/test-utils/flat-style';

describe('<Card />', () => {
  test('renders children on the elevated surface', async () => {
    const { getByText, getByTestId } = await render(
      <Card testID="card">
        <Text>Loan summary</Text>
      </Card>,
    );
    getByText('Loan summary');
    expect(flatStyle(getByTestId('card'))).toMatchObject({
      backgroundColor: Colors.light.elevated,
    });
  });
});
