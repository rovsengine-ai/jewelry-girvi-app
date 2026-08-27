/**
 * Web session persistence via localStorage (SecureStore has no web implementation).
 * https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
 */
export type SessionStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

const memoryStorageAdapter: SessionStorageAdapter = {
  getItem: (key) => Promise.resolve(memoryStore.get(key) ?? null),
  setItem: (key, value) => {
    memoryStore.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key) => {
    memoryStore.delete(key);
    return Promise.resolve();
  },
};

export const sessionStorageAdapter: SessionStorageAdapter =
  typeof localStorage !== 'undefined'
    ? {
        getItem: (key) => Promise.resolve(localStorage.getItem(key)),
        setItem: (key, value) => {
          localStorage.setItem(key, value);
          return Promise.resolve();
        },
        removeItem: (key) => {
          localStorage.removeItem(key);
          return Promise.resolve();
        },
      }
    : memoryStorageAdapter;
