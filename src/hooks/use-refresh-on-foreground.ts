import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Reload shop/customer lists when the phone comes back to the foreground so
 * two devices on the same hosted project stay in sync without a pull.
 */
export function useRefreshOnForeground(refresh: () => void | Promise<void>): void {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });
    return () => {
      sub.remove();
    };
  }, [refresh]);
}
