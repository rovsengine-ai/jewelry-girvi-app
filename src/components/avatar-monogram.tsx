import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Radii, Sizes, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';

const AVATAR_TINT_COUNT = 5;

export function initialsFromName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  if (trimmed === '') return '';
  const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
  const charsOf = (value: string) => Array.from(value);
  if (parts.length === 1) {
    return charsOf(parts[0]).slice(0, 2).join('');
  }
  const first = charsOf(parts[0])[0] ?? '';
  const last = charsOf(parts[parts.length - 1])[0] ?? '';
  return `${first}${last}`;
}

export function avatarColorIndex(name: string): number {
  let hash = 0;
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    hash = (hash * 31 + code) | 0;
  }
  return Math.abs(hash) % AVATAR_TINT_COUNT;
}

export function avatarTintPair(
  index: number,
  colors: Palette,
): { background: string; foreground: string } {
  const pairs: { background: string; foreground: string }[] = [
    { background: colors.tintPrimary, foreground: colors.primary },
    { background: colors.tintSuccess, foreground: colors.onTintSuccess },
    { background: colors.tintWarning, foreground: colors.onTintWarning },
    { background: colors.tintDanger, foreground: colors.onTintDanger },
    { background: colors.tintRedeemed, foreground: colors.onTintRedeemed },
  ];
  return pairs[index] ?? pairs[0];
}

export function AvatarMonogram({
  name,
  testID,
}: {
  name: string | null | undefined;
  testID?: string;
}) {
  const colors = useTheme();
  const { t } = useLanguage();
  const initials = initialsFromName(name);
  const tint = avatarTintPair(avatarColorIndex(name?.trim() ?? ''), colors);

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={name?.trim() ? name : t('a11y.person')}
      style={[
        styles.circle,
        {
          backgroundColor: tint.background,
        },
      ]}>
      {initials === '' ? (
        <AppIcon
          ios="person.fill"
          android="person"
          color={tint.foreground}
          size={Sizes.leadingIcon}
        />
      ) : (
        <ThemedText type="label" style={{ color: tint.foreground }}>
          {initials}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: Sizes.avatar,
    height: Sizes.avatar,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
