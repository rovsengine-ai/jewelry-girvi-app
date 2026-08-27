/**
 * Native session persistence via SecureStore.
 * https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
 */
import * as SecureStore from 'expo-secure-store';

export type SessionStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export const sessionStorageAdapter: SessionStorageAdapter = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
