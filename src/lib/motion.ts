import { FadeIn, ReduceMotion } from 'react-native-reanimated';

/**
 * Motion budget: nothing longer than 300ms.
 * Stack uses a timing curve (slide_from_right), never a custom spring.
 * iOS native default is 350ms — we cap at 300.
 */
export const MOTION = {
  stackDurationMs: 300,
  tabFadeMs: 150,
  rowEnterMs: 150,
  rowStaggerMs: 18,
  rowEnterCap: 8,
  pressMs: 100,
  pressScale: 0.98,
  shimmerMs: 900,
} as const;

export type StackAnimationName = 'none' | 'slide_from_right';
export type TabAnimationName = 'none' | 'fade';

export function stackAnimation(reduceMotion: boolean): StackAnimationName {
  return reduceMotion ? 'none' : 'slide_from_right';
}

export function stackMotionOptions(reduceMotion: boolean): {
  animation: StackAnimationName;
  animationDuration: number;
} {
  return {
    animation: stackAnimation(reduceMotion),
    animationDuration: MOTION.stackDurationMs,
  };
}

export function tabAnimation(reduceMotion: boolean): TabAnimationName {
  return reduceMotion ? 'none' : 'fade';
}

/** Documented Bottom Tabs transitionSpec (timing, not RN Animated.timing in app code). */
export function tabTransitionSpec(): {
  animation: 'timing';
  config: { duration: number };
} {
  return {
    animation: 'timing',
    config: { duration: MOTION.tabFadeMs },
  };
}

export function rowEnterFinishesAtMs(index: number): number {
  if (index < 0 || index >= MOTION.rowEnterCap) return 0;
  return MOTION.rowEnterMs + index * MOTION.rowStaggerMs;
}

export function rowEntering(index: number, reduceMotion: boolean) {
  if (reduceMotion || index < 0 || index >= MOTION.rowEnterCap) {
    return undefined;
  }
  return FadeIn.duration(MOTION.rowEnterMs)
    .delay(index * MOTION.rowStaggerMs)
    .reduceMotion(ReduceMotion.System);
}

export function pressScaleValue(reduceMotion: boolean): number {
  return reduceMotion ? 1 : MOTION.pressScale;
}
