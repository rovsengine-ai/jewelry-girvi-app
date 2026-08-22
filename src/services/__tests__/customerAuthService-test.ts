jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
    rpc: jest.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import {
  issueLoginToken,
  redeemLoginTokenForSession,
  setCustomerPin,
  signInWithCustomerPin,
} from '@/services/customerAuthService';

const invoke = supabase.functions.invoke as jest.Mock;
const rpc = supabase.rpc as jest.Mock;

describe('customerAuthService', () => {
  beforeEach(() => {
    invoke.mockReset();
    rpc.mockReset();
  });

  it('maps locked PIN failures', async () => {
    invoke.mockResolvedValue({ data: { error: 'locked' }, error: null });
    const result = await signInWithCustomerPin('9000000001', '654321');
    expect(result).toEqual({ ok: false, code: 'locked' });
  });

  it('returns session tokens on PIN success', async () => {
    invoke.mockResolvedValue({
      data: {
        access_token: 'a',
        refresh_token: 'r',
        profile_id: 'p1',
      },
      error: null,
    });
    const result = await signInWithCustomerPin('9000000001', '654321');
    expect(result).toEqual({
      ok: true,
      accessToken: 'a',
      refreshToken: 'r',
      profileId: 'p1',
    });
  });

  it('redeems activation tokens via edge function', async () => {
    invoke.mockResolvedValue({
      data: {
        access_token: 'a',
        refresh_token: 'r',
        profile_id: 'p1',
        loan_id: 'l1',
      },
      error: null,
    });
    const result = await redeemLoginTokenForSession('tok');
    expect(invoke).toHaveBeenCalledWith('customer-session', {
      body: { action: 'activate', token: 'tok' },
    });
    expect(result).toEqual({
      ok: true,
      accessToken: 'a',
      refreshToken: 'r',
      profileId: 'p1',
      loanId: 'l1',
    });
  });

  it('issues login tokens through RPC', async () => {
    rpc.mockResolvedValue({ data: 'token-value', error: null });
    const result = await issueLoginToken('p1', 'l1');
    expect(rpc).toHaveBeenCalledWith('issue_login_token', {
      p_profile_id: 'p1',
      p_loan_id: 'l1',
    });
    expect(result).toEqual({ token: 'token-value', error: null });
  });

  it('sets PIN through RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(setCustomerPin('654321')).resolves.toEqual({ error: null });
    expect(rpc).toHaveBeenCalledWith('set_customer_pin', { p_pin: '654321' });
  });
});
