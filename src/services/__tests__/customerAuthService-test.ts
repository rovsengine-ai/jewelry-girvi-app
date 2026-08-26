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
  registerCustomerWithPin,
  resetCustomerPin,
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

  it('registers customer via edge register action', async () => {
    invoke.mockResolvedValue({
      data: {
        access_token: 'a',
        refresh_token: 'r',
        profile_id: 'p1',
        created: true,
      },
      error: null,
    });
    const result = await registerCustomerWithPin('9000000001', '582914');
    expect(invoke).toHaveBeenCalledWith('customer-session', {
      body: { action: 'register', phone: '9000000001', pin: '582914' },
    });
    expect(result).toEqual({
      ok: true,
      accessToken: 'a',
      refreshToken: 'r',
      profileId: 'p1',
      created: true,
    });
  });

  it('maps already_registered on signup', async () => {
    invoke.mockResolvedValue({
      data: { error: 'already_registered', message: 'exists' },
      error: null,
    });
    const result = await registerCustomerWithPin('9000000001', '582914');
    expect(result).toEqual({ ok: false, code: 'already_registered', message: 'exists' });
  });

  it('resets customer PIN through RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(resetCustomerPin('cust-1')).resolves.toEqual({ error: null });
    expect(rpc).toHaveBeenCalledWith('admin_reset_customer_pin', {
      p_profile_id: 'cust-1',
    });
  });
});
