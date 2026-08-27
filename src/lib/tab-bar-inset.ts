import { Platform } from 'react-native';

import { BottomTabInset, Glass } from '@/constants/theme';

/**
 * Height of the absolute tab bar including the home-indicator / nav-bar inset.
 * Used for tabBarStyle.height. Docs: tabBarBackground + position absolute
 * https://docs.expo.dev/router/advanced/tabs/
 */
export function tabBarOccupiedHeight(safeAreaBottom: number): number {
  const browserChrome = Platform.OS === 'web' ? 12 : 0;
  return Glass.tabBarHeight + safeAreaBottom + browserChrome;
}

/**
 * Bottom padding so list/scroll content clears the absolute tab bar.
 * BottomTabInset is the chrome token; safeAreaBottom is useSafeAreaInsets().bottom.
 * BottomTabInset is >= Glass.tabBarHeight on both platforms, so this is never
 * smaller than the bar itself.
 */
export function tabBarScrollPadding(safeAreaBottom: number): number {
  const browserChrome = Platform.OS === 'web' ? 12 : 0;
  return BottomTabInset + safeAreaBottom + browserChrome;
}
