/**
 * Height accordion. Reanimated withTiming, not LayoutAnimation.
 * Chevron rotation lives with the header that owns the press target.
 *
 * https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/
 */
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { MOTION } from '@/lib/motion';

export function Accordion({
  expanded,
  children,
}: {
  expanded: boolean;
  children: ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  const [measured, setMeasured] = useState(0);
  const height = useSharedValue(0);

  useEffect(() => {
    const next = expanded ? measured : 0;
    if (reduceMotion || measured === 0) {
      height.value = next;
      return;
    }
    height.value = withTiming(next, {
      duration: MOTION.accordionMs,
      reduceMotion: ReduceMotion.System,
    });
  }, [expanded, measured, reduceMotion, height]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View style={[styles.clip, bodyStyle]}>
      <View
        style={styles.measure}
        onLayout={(event) => {
          setMeasured(event.nativeEvent.layout.height);
        }}>
        {children}
      </View>
    </Animated.View>
  );
}

export function useChevronRotation(expanded: boolean) {
  const reduceMotion = useReduceMotion();
  const rotation = useSharedValue(expanded ? MOTION.chevronRotateDeg : 0);

  useEffect(() => {
    const next = expanded ? MOTION.chevronRotateDeg : 0;
    if (reduceMotion) {
      rotation.value = next;
      return;
    }
    rotation.value = withTiming(next, {
      duration: MOTION.accordionMs,
      reduceMotion: ReduceMotion.System,
    });
  }, [expanded, reduceMotion, rotation]);

  return useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  measure: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});
