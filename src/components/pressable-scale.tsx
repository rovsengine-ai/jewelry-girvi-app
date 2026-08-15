/**
 * Press scale + selection haptics. Animation runs on the UI thread
 * (Reanimated withSpring). Haptics fire on the JS thread, not from a worklet.
 *
 * https://docs.expo.dev/versions/v57.0.0/sdk/haptics/
 */
import * as Haptics from 'expo-haptics';
import { Pressable, type PressableProps, type PressableStateCallbackType } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { MOTION, pressScaleValue } from '@/lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  onPressIn,
  onPressOut,
  disabled,
  style,
  ...rest
}: PressableProps) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      style={
        typeof style === 'function'
          ? (state: PressableStateCallbackType) => [animatedStyle, style(state)]
          : [animatedStyle, style]
      }
      onPressIn={(event) => {
        if (!disabled) {
          const target = pressScaleValue(reduceMotion);
          if (target === 1) {
            scale.value = 1;
          } else {
            scale.value = withSpring(target, {
              duration: MOTION.pressMs,
              reduceMotion: ReduceMotion.System,
            });
          }
          void Haptics.selectionAsync();
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (reduceMotion) {
          scale.value = 1;
        } else {
          scale.value = withSpring(1, {
            duration: MOTION.pressMs,
            reduceMotion: ReduceMotion.System,
          });
        }
        onPressOut?.(event);
      }}
      {...rest}
    />
  );
}
