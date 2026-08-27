/**
 * Center the Expo web app on large screens. Height must be explicit on web or
 * the inner column collapses to a blank gray page.
 */
import { type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function AppFrame({ children }: { children: ReactNode }) {
  const colors = useTheme();
  return (
    <View style={[styles.outer, { backgroundColor: colors.surfaceSunken }]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: '100%',
    ...(Platform.OS === 'web' ? { minHeight: '100%' as const, height: '100%' as const } : {}),
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    ...(Platform.OS === 'web' ? { minHeight: '100%' as const, height: '100%' as const } : {}),
  },
});
