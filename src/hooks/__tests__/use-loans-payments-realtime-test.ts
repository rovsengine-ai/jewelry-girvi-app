import { renderHook, waitFor } from '@testing-library/react-native';

const mockRemoveChannel = jest.fn(async (_ch?: unknown) => 'ok' as const);
const mockOn = jest.fn();
const mockSubscribe = jest.fn();
const mockChannel = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (name: string) => mockChannel(name),
    removeChannel: (ch: unknown) => mockRemoveChannel(ch),
  },
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

import { useLoansPaymentsRealtime } from '@/hooks/use-loans-payments-realtime';
import { useAuth } from '@/providers/auth-provider';

const useAuthMock = useAuth as jest.MockedFunction<typeof useAuth>;

const authStub = {
  session: null as { user: { id: string } } | null,
  profile: null,
  isLoading: false,
  authMode: 'pin' as const,
  signOut: jest.fn(),
  refreshProfile: jest.fn(),
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  signInWithPin: jest.fn(),
  redeemActivation: jest.fn(),
  setPinForCurrentUser: jest.fn(),
  registerWithPin: jest.fn(),
};

describe('useLoansPaymentsRealtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const channelObj = {
      on: mockOn,
      subscribe: mockSubscribe,
    };
    mockOn.mockReturnValue(channelObj);
    mockSubscribe.mockReturnValue(channelObj);
    mockChannel.mockReturnValue(channelObj);
  });

  it('does not subscribe without a session', async () => {
    useAuthMock.mockReturnValue({ ...authStub, session: null });
    await renderHook(() => useLoansPaymentsRealtime(jest.fn()));
    expect(mockChannel).not.toHaveBeenCalled();
  });

  it('subscribes to loans and payments and removes the channel on unmount', async () => {
    useAuthMock.mockReturnValue({
      ...authStub,
      session: { user: { id: 'user-1' } } as never,
    });
    const onChange = jest.fn();
    const { unmount } = await renderHook(() => useLoansPaymentsRealtime(onChange));

    expect(mockChannel).toHaveBeenCalledWith('loans-payments:user-1');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'loans' },
      expect.any(Function),
    );
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'payments' },
      expect.any(Function),
    );
    expect(mockSubscribe).toHaveBeenCalled();

    const loansHandler = mockOn.mock.calls.find(
      (call) => (call[1] as { table?: string })?.table === 'loans',
    )?.[2] as () => void;
    loansHandler();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

    unmount();
    await waitFor(() => expect(mockRemoveChannel).toHaveBeenCalled());
  });
});
