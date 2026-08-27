import * as SecureStore from 'expo-secure-store';

export const PRACTICE_MODE_KEY = 'girvi.practice_mode';

export async function readPracticeMode(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PRACTICE_MODE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function persistPracticeMode(next: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(PRACTICE_MODE_KEY, next ? '1' : '0');
  } catch {
    // Best effort only.
  }
}
