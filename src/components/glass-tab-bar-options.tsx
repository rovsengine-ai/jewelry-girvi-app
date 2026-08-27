/**
 * Shared JS-tabs chrome. Solid `chrome` fill on iOS and Android — not
 * translucent GlassSurface, not dimezis blur.
 * Gold 3px bar sits on the TOP edge of the focused tab item.
 *
 * https://docs.expo.dev/router/advanced/tabs/
 * https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
 * https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/
 * https://docs.expo.dev/versions/v57.0.0/sdk/haptics/
 */
import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { Sizes } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { MOTION, tabAnimation, tabTransitionSpec } from '@/lib/motion';
import { tabBarOccupiedHeight } from '@/lib/tab-bar-inset';

export function GlassTabBarBackground() {
  const colors = useTheme();
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.chrome }]} />;
}

type ChromeTabBarButtonProps = {
  children?: ReactNode;
  onPress?: PressableProps['onPress'];
  onLongPress?: PressableProps['onLongPress'];
  accessibilityState?: { selected?: boolean };
  accessibilityLabel?: string;
  testID?: string;
  style?: PressableProps['style'];
};

export function ChromeTabBarButton({
  children,
  onPress,
  onLongPress,
  accessibilityState,
  accessibilityLabel,
  testID,
  style,
}: ChromeTabBarButtonProps) {
  const colors = useTheme();
  const reduceMotion = useReduceMotion();
  const focused = Boolean(accessibilityState?.selected);
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    const next = focused ? 1 : 0;
    if (reduceMotion) {
      progress.value = next;
      return;
    }
    progress.value = withTiming(next, {
      duration: MOTION.tabIndicatorMs,
      reduceMotion: ReduceMotion.System,
    });
  }, [focused, reduceMotion, progress]);

  const barStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      style={style}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            backgroundColor: colors.gold,
            height: Sizes.tabIndicator,
          },
          barStyle,
        ]}
      />
      {children}
    </PressableScale>
  );
}

export function useGlassTabBarOptions(): {
  headerShown: false;
  tabBarActiveTintColor: string;
  tabBarInactiveTintColor: string;
  tabBarBackground: typeof GlassTabBarBackground;
  tabBarButton: typeof ChromeTabBarButton;
  tabBarStyle: ViewStyle;
  animation: 'none' | 'fade';
  transitionSpec: ReturnType<typeof tabTransitionSpec>;
} {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  return {
    headerShown: false,
    tabBarActiveTintColor: colors.onChrome,
    tabBarInactiveTintColor: colors.onChromeMuted,
    tabBarBackground: GlassTabBarBackground,
    tabBarButton: ChromeTabBarButton,
    tabBarStyle: {
      position: 'absolute',
      backgroundColor: colors.chrome,
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

const styles = StyleSheet.create({
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    minHeight: Sizes.hairline,
  },
});
