import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LoanWithCustomer } from '@/types/database';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ id: 'loan-1' }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    profile: { id: 'user-1', role: 'owner', full_name: 'Owner', phone_number: '+919000000002' },
    isLoading: false,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
  }),
}));

jest.mock('@/providers/language-provider', () => {
  const { translate } = require('@/i18n') as typeof import('@/i18n');
  const t = (key: string, options?: Record<string, string | number>) =>
    translate(key, options, 'en');
  return {
    useLanguage: () => ({
      language: 'en' as const,
      setLanguage: jest.fn(),
      t,
    }),
  };
});

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('@/services/loanService', () => ({
  editLoanTerms: jest.fn(),
}));

import { supabase } from '@/lib/supabase';
import { editLoanTerms } from '@/services/loanService';

import EditLoanTermsScreen from '../terms';

const fromMock = supabase.from as jest.MockedFunction<typeof supabase.from>;
const editLoanTermsMock = editLoanTerms as jest.MockedFunction<typeof editLoanTerms>;

const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 851 },
  insets: { top: 24, left: 0, right: 0, bottom: 48 },
};

function sampleLoan(): LoanWithCustomer {
  return {
    id: 'loan-1',
    customer_id: 'cust-1',
    serial_number: '3878',
    item_name: 'Gold chain',
    weight_grams: 10,
    status: 'active',
    principal_paise: 100000,
    rate_bps: 500,
    disbursed_on: '2023-10-30',
    interest_model: 'retail',
    simple_period_days: 180,
    compound_every_days: 30,
    grace_days: 0,
    partial_period_mode: 'min_month_then_pro_rata',
    round_up_threshold_days: 24,
    receipt_image_url: null,
    digital_signature_url: null,
    release_signature_url: null,
    redeemed_on: null,
    redeemed_by: null,
    released_to_name: null,
    release_note: null,
    closure_balance_paise: null,
    defaulted_on: null,
    defaulted_by: null,
    default_balance_paise: null,
    default_reason: null,
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    archive_balance_paise: null,
    public_token: 'test-public-token',
    created_at: '2023-10-30T00:00:00Z',
    updated_at: '2023-10-30T00:00:00Z',
    profiles: {
      full_name: 'Asha Patil',
      phone_number: '+919876543210',
      address: null,
      role: 'retail_customer',
      id_document_type: null,
      kyc_verified_on: null,
      guardian_name: null,
      photo_path: null,
    },
  };
}

function thenable<T extends { data: unknown; error: null }>(result: T) {
  const chain: {
    select: jest.Mock;
    eq: jest.Mock;
    maybeSingle: jest.Mock;
    then: (resolve: (value: T) => unknown) => Promise<unknown>;
  } = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(async () => result),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

describe('edit loan terms save', () => {
  beforeEach(() => {
    editLoanTermsMock.mockReset();
    fromMock.mockImplementation(
      () => thenable({ data: sampleLoan(), error: null }) as never,
    );
  });

  test('tells the owner to type a reason instead of silently ignoring Save', async () => {
    const { getByTestId, findByText, unmount } = await render(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <EditLoanTermsScreen />
      </SafeAreaProvider>,
    );

    await findByText('Edit terms 3878');
    fireEvent.press(getByTestId('save-loan-terms'));
    await waitFor(() => {
      expect(getByTestId('screen-error').props.children).toBe(
        'Type a reason before saving terms.',
      );
    });
    expect(editLoanTermsMock).not.toHaveBeenCalled();
    unmount();
  });

  test('maps no_term_change to a visible message instead of a silent no-op', async () => {
    editLoanTermsMock.mockRejectedValue(new Error('no_term_change: nothing to update'));

    const { getByTestId, findByText, unmount } = await render(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <EditLoanTermsScreen />
      </SafeAreaProvider>,
    );

    await findByText('Edit terms 3878');
    fireEvent.changeText(getByTestId('term-reason'), 'Correcting rate');
    await waitFor(() => {
      expect(getByTestId('term-reason').props.value).toBe('Correcting rate');
    });
    fireEvent.press(getByTestId('save-loan-terms'));
    await waitFor(() => {
      expect(editLoanTermsMock).toHaveBeenCalled();
      expect(getByTestId('screen-error').props.children).toBe(
        'Nothing changed. Edit a field, then save.',
      );
    });
    unmount();
  });
});
