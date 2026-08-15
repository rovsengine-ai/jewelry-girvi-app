import { StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { PressableScale } from '@/components/pressable-scale';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';

export function SearchField({
  value,
  onChangeText,
  placeholder,
  testID,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  testID?: string;
}) {
  const colors = useTheme();
  const { t } = useLanguage();

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surfaceSunken,
        },
      ]}>
      <AppIcon
        ios="magnifyingglass"
        android="search"
        color={colors.textSecondary}
        size={Spacing.three}
        accessibilityLabel={t('a11y.search')}
      />
      <TextInput
        accessibilityLabel={t('a11y.search')}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        value={value}
        onChangeText={onChangeText}
        testID={testID}
        style={[styles.input, { color: colors.text }]}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('a11y.clearSearch')}
          onPress={() => onChangeText('')}
          style={styles.clear}>
          <AppIcon
            ios="xmark.circle.fill"
            android="close"
            color={colors.textSecondary}
            size={Spacing.three}
          />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: MinTouchTarget,
    borderRadius: Radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: MinTouchTarget,
    paddingVertical: Spacing.two,
  },
  clear: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
