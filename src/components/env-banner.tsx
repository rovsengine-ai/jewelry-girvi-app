import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { appEnv, getSupabaseHost } from '@/lib/supabase';

/**
 * Permanent non-production strip. Never dismissible — overlaid at the top of
 * the root layout so it appears on every route without changing screen chrome.
 */
export function EnvBanner() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  if (appEnv === 'production') {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      testID="env-banner"
      style={[
        styles.banner,
        {
          paddingTop: insets.top + Spacing.one,
          backgroundColor: colors.tintWarning,
        },
      ]}>
      <ThemedText
        type="label"
        style={{ color: colors.onTintWarning, textAlign: 'center' }}>
        {appEnv} · {getSupabaseHost()}
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
    zIndex: 1000,
    paddingBottom: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
});
