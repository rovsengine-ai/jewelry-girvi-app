/**
 * Chrome-only glass surface. Do not put behind MoneyText, weights, or list rows.
 *
 * Branch order (opaque wins):
 *   solid / reduce-transparency → opaque View
 *   iOS 26+ Liquid Glass → GlassView
 *   other iOS → BlurView
 *   Android → tinted View; optional BlurView when EXPO_PUBLIC_ENABLE_ANDROID_BLUR
 *
 * Docs (SDK 57):
 * https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/
 * https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/
 */
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Platform,
  View,
  type ViewProps,
} from 'react-native';

import { Glass } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type GlassSurfaceProps = ViewProps & {
  solid?: boolean;
  children?: ReactNode;
};

function androidBlurEnabled(): boolean {
  // Default OFF. SDK 57's documented prop is blurMethod (not experimentalBlurMethod).
  // dimezisBlurView costs frames on Android SDK 30 and below:
  // https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/
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
        height: 1,
        backgroundColor: color,
      }}
    />
  );
}

export function GlassSurface({ solid = false, style, children, ...rest }: GlassSurfaceProps) {
  const colors = useTheme();
  const scheme = useColorScheme();
  const blurTint = scheme === 'dark' ? 'dark' : 'light';
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
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
        intensity={Glass.blurIntensity}
        tint={blurTint}
        style={[{ backgroundColor: colors.glassTint }, chrome, style]}
        {...rest}>
        <GlassHighlight color={colors.glassHighlight} />
        {children}
      </BlurView>
    );
  }

  if (Platform.OS === 'android' && androidBlurEnabled()) {
    return (
      <BlurView
        intensity={Glass.blurIntensity}
        tint={blurTint}
        blurMethod="dimezisBlurView"
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
