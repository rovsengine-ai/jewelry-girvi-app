/**
 * Chrome-only glass surface. Do not put behind MoneyText, weights, or list rows.
 *
 * Branch order (opaque wins):
 *   solid / reduce-transparency → opaque View
 *   iOS 26+ Liquid Glass → GlassView
 *   other iOS → BlurView
 *   Android + blurTarget → BlurView (dimezisBlurViewSdk31Plus)
 *   Android otherwise → tinted View
 *
 * Android dimezis blur requires a BlurTargetView ref (SDK 55+). Without it we
 * never set blurMethod, so Expo does not warn and fall back to none.
 *
 * Docs (SDK 57):
 * https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/
 * https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/
 */
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Platform,
  View,
  type ViewProps,
} from 'react-native';

import { Glass, Sizes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type GlassSurfaceProps = ViewProps & {
  solid?: boolean;
  /**
   * Request Android dimezis blur when a `blurTarget` is also provided.
   * Without `blurTarget`, Android stays on the tinted fallback (no warning).
   * Never use behind MoneyText / weights / rates / dates.
   * https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/
   */
  androidBlur?: boolean;
  /**
   * Ref to a `BlurTargetView` wrapping the content behind this chrome.
   * Required for real Android blur (dimezisBlurViewSdk31Plus).
   */
  blurTarget?: RefObject<View | null>;
  /** Slightly stronger blur for floating sheets / camera docks. */
  intensity?: 'default' | 'strong';
  children?: ReactNode;
};

function androidBlurEnabled(force?: boolean): boolean {
  if (force) return true;
  // Default OFF globally. Costs frames on Android SDK 30 and below.
  const flag = process.env.EXPO_PUBLIC_ENABLE_ANDROID_BLUR;
  return flag === 'true' || flag === '1';
}

function GlassHighlight({ color }: { color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: Sizes.hairline,
        backgroundColor: color,
      }}
    />
  );
}

export function GlassSurface({
  solid = false,
  androidBlur = false,
  blurTarget,
  intensity = 'default',
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const colors = useTheme();
  const scheme = useColorScheme();
  const blurTint = scheme === 'dark' ? 'dark' : 'light';
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const blurIntensity =
    intensity === 'strong' ? Glass.blurIntensityStrong : Glass.blurIntensity;

  useEffect(() => {
    // Web has no reduce-transparency API; calling it unmounts the whole tree.
    // https://reactnative.dev/docs/accessibilityinfo#isreducetransparencyenabled
    if (Platform.OS === 'web') return;
    if (typeof AccessibilityInfo.isReduceTransparencyEnabled !== 'function') return;

    let mounted = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (mounted) setReduceTransparency(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (enabled) => {
      setReduceTransparency(enabled);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const chrome = {
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  };

  const opaque = solid || reduceTransparency;
  if (opaque) {
    return (
      <View
        style={[{ backgroundColor: colors.glassTintStrong }, chrome, style]}
        {...rest}>
        <GlassHighlight color={colors.glassHighlight} />
        {children}
      </View>
    );
  }

  if (Platform.OS === 'ios' && Glass.supportsNativeGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={colors.glassTint}
        colorScheme={scheme === 'dark' ? 'dark' : 'light'}
        style={[chrome, style]}
        {...rest}>
        <GlassHighlight color={colors.glassHighlight} />
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={blurIntensity}
        tint={blurTint}
        style={[{ backgroundColor: colors.glassTint }, chrome, style]}
        {...rest}>
        <GlassHighlight color={colors.glassHighlight} />
        {children}
      </BlurView>
    );
  }

  if (Platform.OS === 'android' && androidBlurEnabled(androidBlur) && blurTarget) {
    return (
      <BlurView
        intensity={blurIntensity}
        tint={blurTint}
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        style={[{ backgroundColor: colors.glassTint }, chrome, style]}
        {...rest}>
        <GlassHighlight color={colors.glassHighlight} />
        {children}
      </BlurView>
    );
  }

  return (
    <View
      style={[{ backgroundColor: colors.glassTintStrong }, chrome, style]}
      {...rest}>
      <GlassHighlight color={colors.glassHighlight} />
      {children}
    </View>
  );
}
