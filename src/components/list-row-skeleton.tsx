import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ListRow } from '@/components/list-row';
import { Radii, Sizes, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { MOTION } from '@/lib/motion';

function Bone({ width, height }: { width: number | `${number}%`; height: number }) {
  const colors = useTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: Radii.sm,
        backgroundColor: colors.backgroundElement,
      }}
    />
  );
}

function AvatarBone() {
  const colors = useTheme();
  return (
    <View
      style={{
        width: Sizes.avatar,
        height: Sizes.avatar,
        borderRadius: Radii.pill,
        backgroundColor: colors.backgroundElement,
      }}
    />
  );
}

export function ListRowSkeleton({ isLast = false }: { isLast?: boolean }) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.45, {
        duration: MOTION.shimmerMs,
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      true,
    );
  }, [opacity, reduceMotion]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={shimmerStyle}>
      <ListRow
        isLast={isLast}
        leading={<AvatarBone />}
        content={
          <View style={styles.linesStart}>
            <Bone width="62%" height={Spacing.three} />
            <Bone width="44%" height={Spacing.two + Spacing.one} />
          </View>
        }
        trailing={
          <View style={styles.lines}>
            <Bone width={Spacing.five + Spacing.two} height={Spacing.three} />
            <Bone width={Spacing.five} height={Spacing.two + Spacing.one} />
          </View>
        }
      />
    </Animated.View>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View>
      {Array.from({ length: rows }, (_, index) => (
        <ListRowSkeleton key={index} isLast={index === rows - 1} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lines: {
    gap: Spacing.one,
    alignItems: 'flex-end',
  },
  linesStart: {
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
});
