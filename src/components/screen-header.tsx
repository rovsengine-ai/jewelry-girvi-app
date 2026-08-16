/**
 * Solid chrome header (not glass). Title is onChrome.
 * Android uses the same solid `chrome` fill — no dimezis blur.
 *
 * Docs: https://docs.expo.dev/versions/v57.0.0/sdk/localization/
 * https://docs.expo.dev/versions/v57.0.0/sdk/router/
 * https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/
 * https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
 * Sliding indicator: react-native-reanimated withTiming (already a dep).
 */
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, TintedIconWell } from '@/components/app-icon';
import { ListRow } from '@/components/list-row';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Glass, MinTouchTarget, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import type { AppLanguage } from '@/i18n';
import { MOTION } from '@/lib/motion';
import { useLanguage } from '@/providers/language-provider';

export function LanguageChips({ variant = 'default' }: { variant?: 'default' | 'chrome' }) {
  const colors = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const reduceMotion = useReduceMotion();
  const [innerWidth, setInnerWidth] = useState(0);
  const translateX = useSharedValue(0);
  const selectedIndex = language === 'en' ? 0 : 1;
  const segmentWidth = innerWidth / 2;
  const onChrome = variant === 'chrome';

  useEffect(() => {
    const next = selectedIndex * segmentWidth;
    if (reduceMotion || segmentWidth === 0) {
      translateX.value = next;
      return;
    }
    translateX.value = withTiming(next, {
      duration: MOTION.tabIndicatorMs,
      reduceMotion: ReduceMotion.System,
    });
  }, [selectedIndex, segmentWidth, reduceMotion, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const chip = (code: AppLanguage, label: string) => {
    const selected = language === code;
    const chipColor = onChrome
      ? selected
        ? colors.onGold
        : colors.onChromeMuted
      : selected
        ? colors.primary
        : colors.text;
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
            minWidth: MinTouchTarget,
            minHeight: MinTouchTarget,
          },
        ]}>
        <ThemedText type="label" style={{ color: chipColor }}>
          {label}
        </ThemedText>
      </PressableScale>
    );
  };

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('a11y.language')}
      onLayout={(event) => {
        setInnerWidth(event.nativeEvent.layout.width - Spacing.half * 2);
      }}
      style={[
        styles.segment,
        {
          backgroundColor: onChrome ? colors.chromeWell : colors.backgroundElement,
        },
      ]}>
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: segmentWidth,
              backgroundColor: onChrome ? colors.gold : colors.tintPrimary,
            },
            indicatorStyle,
          ]}
        />
      ) : null}
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
  segment: {
    flexDirection: 'row',
    borderRadius: Radii.pill,
    overflow: 'hidden',
    padding: Spacing.half,
  },
  indicator: {
    position: 'absolute',
    top: Spacing.half,
    bottom: Spacing.half,
    left: Spacing.half,
    borderRadius: Radii.pill,
  },
  segmentItem: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
