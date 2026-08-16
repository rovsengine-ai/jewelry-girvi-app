import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { LANGUAGE_STORE_KEY } from '@/i18n';
import { LanguageProvider, useLanguage } from '@/providers/language-provider';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

function Probe() {
  const { language } = useLanguage();
  return <Text testID="lang">{language}</Text>;
}

describe('LanguageProvider first launch', () => {
  beforeEach(() => {
    jest.mocked(SecureStore.getItemAsync).mockReset();
    jest.mocked(SecureStore.setItemAsync).mockReset();
  });

  test('defaults to Hindi and persists it when nothing is stored', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

    const { getByTestId } = await render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    expect(getByTestId('lang').props.children).toBe('hi');
    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(LANGUAGE_STORE_KEY, 'hi');
    });
  });

  test('keeps a stored English preference', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('en');

    const { getByTestId } = await render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('lang').props.children).toBe('en');
    });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
