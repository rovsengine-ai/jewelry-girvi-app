/**
 * Persistent strip when the device is offline. Mirrors EnvBanner placement
 * so it is visible on every route without changing screen chrome.
 */
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { appEnv } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useNetwork } from '@/providers/network-provider';

export function OfflineBanner() {
  const { isOffline } = useNetwork();
  const { t } = useLanguage();
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  if (!isOffline) {
    return null;
  }

  // Sit below the env banner in non-production so both remain readable.
  const topPad =
    appEnv === 'production' ? insets.top + Spacing.one : insets.top + Spacing.five;

  return (
    <View
      pointerEvents="none"
      testID="offline-banner"
      style={[
        styles.banner,
        {
          paddingTop: topPad,
          backgroundColor: colors.tintDanger,
        },
      ]}>
      <ThemedText type="label" style={{ color: colors.onTintDanger, textAlign: 'center' }}>
        {t('network.offlineBanner')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1001,
    paddingBottom: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
});
