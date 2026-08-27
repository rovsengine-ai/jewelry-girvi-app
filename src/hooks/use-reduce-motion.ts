import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Live Reduce Motion flag. Reanimated's useReducedMotion() is sampled at
 * process start; this follows AccessibilityInfo for the rest of the session.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}
