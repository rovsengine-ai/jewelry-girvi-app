import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services/loanService', () => ({
  fetchRateYield: jest.fn(() => Promise.resolve([])),
}));

import { useAuth } from '@/providers/auth-provider';

import AdminInsightsScreen from '../insights';

const useAuthMock = useAuth as jest.MockedFunction<typeof useAuth>;

function authValue(role: 'staff' | 'owner') {
  return {
    session: { user: { id: 'user-1' } },
    profile: { id: 'user-1', role, full_name: 'Test', phone_number: '+919000000002' },
    isLoading: false,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
  };
}

const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 851 },
  insets: { top: 24, left: 0, right: 0, bottom: 48 },
};

function renderInsights() {
  return render(
    <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
      <AdminInsightsScreen />
    </SafeAreaProvider>,
  );
}

describe('Admin Insights URL gate', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  test('staff typing the insights URL is redirected to loans', async () => {
    useAuthMock.mockReturnValue(authValue('staff') as never);

    await renderInsights();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(admin)/shop/(tabs)/loans');
    });
  });

  test('owner is not redirected away from insights', async () => {
    useAuthMock.mockReturnValue(authValue('owner') as never);

    const { getByText } = await renderInsights();

    await waitFor(() => {
      getByText('Girvi');
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
