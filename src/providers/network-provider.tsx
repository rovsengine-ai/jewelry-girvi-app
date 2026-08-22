/**
 * Network connectivity for offline-safe counter UX.
 * Uses @react-native-community/netinfo (Expo SDK 57):
 * https://docs.expo.dev/versions/v57.0.0/sdk/netinfo/
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

function isStateOffline(state: NetInfoState): boolean {
  // isInternetReachable is null while unknown — do not treat that as offline.
  return state.isConnected === false || state.isInternetReachable === false;
}

export interface NetworkContextValue {
  /** True when the device reports no usable network. */
  isOffline: boolean;
  /** Inverse of isOffline. */
  isOnline: boolean;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let mounted = true;

    void NetInfo.fetch().then((state) => {
      if (mounted) setIsOffline(isStateOffline(state));
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(isStateOffline(state));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isOffline, isOnline: !isOffline }}>
      {children}
    </NetworkContext.Provider>
  );
}

/** Prefer this in shared UI so unit tests need not wrap NetworkProvider. */
export function useNetworkOptional(): NetworkContextValue {
  return useContext(NetworkContext) ?? { isOffline: false, isOnline: true };
}

export function useNetwork(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within NetworkProvider');
  }
  return context;
}
