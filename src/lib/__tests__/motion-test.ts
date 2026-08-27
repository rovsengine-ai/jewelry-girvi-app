import {
  MOTION,
  pressScaleValue,
  rowEnterFinishesAtMs,
  rowEntering,
  stackAnimation,
  tabAnimation,
  tabTransitionSpec,
} from '@/lib/motion';

describe('motion tokens', () => {
  test('stack animation is none when Reduce Motion is on', () => {
    expect(stackAnimation(true)).toBe('none');
    expect(stackAnimation(false)).toBe('slide_from_right');
  });

  test('tab fade is 150ms via transitionSpec, none when Reduce Motion is on', () => {
    expect(tabAnimation(true)).toBe('none');
    expect(tabAnimation(false)).toBe('fade');
    expect(tabTransitionSpec()).toEqual({
      animation: 'timing',
      config: { duration: MOTION.tabFadeMs },
    });
    expect(MOTION.tabFadeMs).toBe(150);
    expect(MOTION.stackDurationMs).toBe(300);
  });

  test('row entering is undefined when Reduce Motion is on', () => {
    expect(rowEntering(0, true)).toBeUndefined();
    expect(rowEntering(3, true)).toBeUndefined();
  });

  test('first 8 rows stagger and finish within 300ms', () => {
    expect(rowEntering(0, false)).toBeDefined();
    expect(rowEntering(7, false)).toBeDefined();
    expect(rowEnterFinishesAtMs(7)).toBe(MOTION.rowEnterMs + 7 * MOTION.rowStaggerMs);
    expect(rowEnterFinishesAtMs(7)).toBeLessThanOrEqual(MOTION.stackDurationMs);
  });

  test('rows from index 8 onward have no entering animation', () => {
    expect(rowEntering(8, false)).toBeUndefined();
    expect(rowEntering(20, false)).toBeUndefined();
    expect(rowEnterFinishesAtMs(8)).toBe(0);
  });

  test('press scale stays 1 when Reduce Motion is on', () => {
    expect(pressScaleValue(true)).toBe(1);
    expect(pressScaleValue(false)).toBe(MOTION.pressScale);
  });
});
