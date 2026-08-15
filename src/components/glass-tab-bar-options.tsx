/**
 * Shared JS-tabs chrome. tabBarBackground + transparent absolute tabBarStyle
 * so content scrolls under the bar.
 * https://docs.expo.dev/router/advanced/tabs/
 * https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
 */
import { StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass-surface';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { tabAnimation, tabTransitionSpec } from '@/lib/motion';
import { tabBarOccupiedHeight } from '@/lib/tab-bar-inset';

export function GlassTabBarBackground() {
  return <GlassSurface style={StyleSheet.absoluteFill} />;
}

export function useGlassTabBarOptions(): {
  headerShown: false;
  tabBarActiveTintColor: string;
  tabBarInactiveTintColor: string;
  tabBarBackground: typeof GlassTabBarBackground;
  tabBarStyle: ViewStyle;
  animation: 'none' | 'fade';
  transitionSpec: ReturnType<typeof tabTransitionSpec>;
} {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textSecondary,
    tabBarBackground: GlassTabBarBackground,
    tabBarStyle: {
      position: 'absolute',
      backgroundColor: 'transparent',
      borderTopWidth: 0,
      elevation: 0,
      height: tabBarOccupiedHeight(insets.bottom),
      paddingBottom: insets.bottom,
    },
    // JS tabs do not swipe between scenes. `swipeEnabled` is not on
    // BottomTabNavigationOptions in this Expo Router build.
    animation: tabAnimation(reduceMotion),
    transitionSpec: tabTransitionSpec(),
  };
}
