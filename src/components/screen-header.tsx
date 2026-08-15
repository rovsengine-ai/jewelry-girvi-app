/**
 * Glass chrome header with a compact EN | हिं segmented control.
 * Never put MoneyText behind this.
 *
 * Docs: https://docs.expo.dev/versions/v57.0.0/sdk/localization/
 */
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass-surface';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Glass, MinTouchTarget, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AppLanguage } from '@/i18n';
import { useLanguage } from '@/providers/language-provider';

export function LanguageChips() {
  const colors = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const chip = (code: AppLanguage, label: string) => {
    const selected = language === code;
    return (
      <PressableScale
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        testID={`language-${code}`}
        onPress={() => setLanguage(code)}
        style={[
          styles.segmentItem,
          {
            backgroundColor: selected ? colors.tintPrimary : 'transparent',
            minWidth: MinTouchTarget,
            minHeight: MinTouchTarget,
          },
        ]}>
        <ThemedText type="label">{label}</ThemedText>
      </PressableScale>
    );
  };

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('a11y.language')}
        style={[
        styles.segment,
        {
          backgroundColor: colors.backgroundElement,
        },
      ]}>
      {chip('en', t('common.langEn'))}
      {chip('hi', t('common.langHi'))}
    </View>
  );
}

export function LanguageSettingsRow() {
  const { t } = useLanguage();
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsCopy}>
        <ThemedText type="smallBold">{t('settings.language')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.languageHint')}
        </ThemedText>
      </View>
      <LanguageChips />
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  trailing,
  collapsed = false,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  collapsed?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <GlassSurface
      style={[
        styles.surface,
        {
          paddingTop: insets.top,
          height: insets.top + Glass.headerHeight,
        },
      ]}>
      <View style={styles.bar}>
        <View style={styles.titleBlock}>
          <ThemedText numberOfLines={1} style={collapsed ? styles.titleCollapsed : styles.title}>
            {title}
          </ThemedText>
          {subtitle && !collapsed ? (
            <ThemedText type="label" themeColor="textSecondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {trailing}
        <LanguageChips />
      </View>
    </GlassSurface>
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
  segment: {
    flexDirection: 'row',
    borderRadius: Radii.pill,
    overflow: 'hidden',
    padding: Spacing.half,
  },
  segmentItem: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: MinTouchTarget,
  },
  settingsCopy: {
    flex: 1,
    gap: Spacing.half,
  },
});
