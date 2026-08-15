import { render } from '@testing-library/react-native';

import {
  AvatarMonogram,
  avatarColorIndex,
  initialsFromName,
} from '@/components/avatar-monogram';
import { Colors } from '@/constants/theme';
import { avatarTintPair } from '@/components/avatar-monogram';
import { flatStyle } from '@/test-utils/flat-style';

describe('AvatarMonogram', () => {
  test('takes two characters from a single Latin name', () => {
    expect(initialsFromName('Asha')).toBe('As');
  });

  test('uses first and last initials, including Devanagari', () => {
    expect(initialsFromName('Asha Patil')).toBe('AP');
    expect(initialsFromName('आशा पाटिल')).toBe('आप');
  });

  test('falls back to a person icon when the name is missing', async () => {
    const { getByTestId, queryByText } = await render(
      <AvatarMonogram name={null} testID="avatar" />,
    );
    getByTestId('avatar');
    expect(queryByText(/[A-Za-zआ-ह]/)).toBeNull();
    getByTestId('symbol-view', { includeHiddenElements: true });
  });

  test('picks a deterministic tint for the same name', async () => {
    const name = 'Meera Shah';
    const expected = avatarTintPair(avatarColorIndex(name), Colors.light);
    const first = await render(<AvatarMonogram name={name} testID="a1" />);
    const second = await render(<AvatarMonogram name={name} testID="a2" />);
    expect(flatStyle(first.getByTestId('a1')).backgroundColor).toBe(expected.background);
    expect(flatStyle(second.getByTestId('a2')).backgroundColor).toBe(expected.background);
  });
});
