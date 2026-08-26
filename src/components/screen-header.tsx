/**
 * Solid chrome header (not glass). Title is onChrome.
 * Android uses the same solid `chrome` fill — no dimezis blur.
 *
 * Docs: https://docs.expo.dev/versions/v57.0.0/sdk/localization/
 * https://docs.expo.dev/versions/v57.0.0/sdk/router/
 * https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
 */
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, TintedIconWell } from '@/components/app-icon';
import { ListRow } from '@/components/list-row';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Glass, MinTouchTarget, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AppLanguage } from '@/i18n';
import { useLanguage } from '@/providers/language-provider';

export function LanguageChips({ variant = 'default' }: { variant?: 'default' | 'chrome' }) {
  const colors = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const onChrome = variant === 'chrome';

  const chip = (code: AppLanguage, label: string) => {
    const selected = language === code;
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        testID={`language-${code}`}
        onPress={() => setLanguage(code)}
        style={styles.langPressable}>
        <View
          style={[
            styles.langChip,
            {
              backgroundColor: selected
                ? onChrome
                  ? colors.gold
                  : colors.primary
                : onChrome
                  ? colors.chromeWell
                  : colors.elevated,
              borderColor: selected
                ? onChrome
                  ? colors.gold
                  : colors.primary
                : onChrome
                  ? colors.onChromeMuted
                  : colors.border,
            },
          ]}>
          <ThemedText
            type="label"
            style={{
              color: selected
                ? onChrome
                  ? colors.onGold
                  : colors.onPrimary
                : onChrome
                  ? colors.onChrome
                  : colors.text,
            }}>
            {label}
          </ThemedText>
        </View>
      </PressableScale>
    );
  };

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t('a11y.language')}
      style={styles.langRow}>
      {chip('en', t('common.langEn'))}
      {chip('hi', t('common.langHi'))}
    </View>
  );
}

export function LanguageSettingsRow() {
  const colors = useTheme();
  const { t } = useLanguage();
  return (
    <ListRow
      tone="elevated"
      isLast
      leading={
        <TintedIconWell tint={colors.tintPrimary}>
          <AppIcon ios="globe" android="language" color={colors.primary} />
        </TintedIconWell>
      }
      content={
        <>
          <ThemedText type="bodyLarge">{t('settings.language')}</ThemedText>
          <ThemedText type="label" themeColor="textSecondary">
            {t('settings.languageHint')}
          </ThemedText>
        </>
      }
      trailing={<LanguageChips />}
    />
  );
}

export function ScreenHeader({
  title,
  subtitle,
  trailing,
  leading,
  showBack = false,
  onBack,
  collapsed = false,
  hero,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  showBack?: boolean;
  /** When set with showBack, used instead of router.back(). */
  onBack?: () => void;
  collapsed?: boolean;
  hero?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { t } = useLanguage();

  const backControl = showBack ? (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      testID="screen-header-back"
      onPress={() => (onBack ? onBack() : router.back())}
      style={styles.iconHit}>
      <AppIcon ios="chevron.left" android="arrow_back" color={colors.onChrome} />
    </PressableScale>
  ) : (
    leading
  );

  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor: colors.chrome,
          paddingTop: insets.top,
          minHeight: insets.top + Glass.headerHeight,
        },
      ]}>
      <View style={styles.bar}>
        {backControl}
        <View style={styles.titleBlock}>
          <ThemedText
            numberOfLines={1}
            style={[
              collapsed ? styles.titleCollapsed : styles.title,
              { color: colors.onChrome },
            ]}>
            {title}
          </ThemedText>
          {subtitle && !collapsed ? (
            <ThemedText type="label" numberOfLines={1} style={{ color: colors.onChromeMuted }}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {trailing}
        <LanguageChips variant="chrome" />
      </View>
      {hero}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    justifyContent: 'flex-end',
  },
  bar: {
    height: Glass.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {
    ...TypeScale.title,
  },
  titleCollapsed: {
    ...TypeScale.label,
  },
  iconHit: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  langPressable: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
  },
  langChip: {
    minHeight: 36,
    minWidth: 40,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
