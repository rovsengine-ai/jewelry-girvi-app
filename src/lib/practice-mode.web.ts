export const PRACTICE_MODE_KEY = 'girvi.practice_mode';

export async function readPracticeMode(): Promise<boolean> {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(PRACTICE_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export async function persistPracticeMode(next: boolean): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PRACTICE_MODE_KEY, next ? '1' : '0');
  } catch {
    // Best effort only.
  }
}
