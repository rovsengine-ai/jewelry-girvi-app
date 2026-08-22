import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LoanBalances, LoanWithCustomer } from '@/types/database';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: 'loan-1' }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('@/services/loanService', () => ({
  archiveLoan: jest.fn(),
  fetchLoanBalances: jest.fn(),
  fetchLoanCurrentDueOn: jest.fn(),
  fetchLoanItems: jest.fn(),
  fetchLoanItemPhotos: jest.fn(async () => []),
  fetchOverdueLoans: jest.fn(),
  logPayment: jest.fn(),
  resolveReceiptDisplayUrl: jest.fn(),
  unredeemLoan: jest.fn(),
}));

jest.mock('@/services/printService', () => ({
  shareHtmlAsPdf: jest.fn(),
}));

jest.mock('@/services/kycService', () => ({
  resolveCustomerPhotoUrl: jest.fn(async () => null),
}));

import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/lib/supabase';
import {
  fetchLoanBalances,
  fetchLoanCurrentDueOn,
  fetchLoanItems,
  fetchOverdueLoans,
  resolveReceiptDisplayUrl,
} from '@/services/loanService';

import LoanDetailScreen from '../index';

const useAuthMock = useAuth as jest.MockedFunction<typeof useAuth>;
const fromMock = supabase.from as jest.MockedFunction<typeof supabase.from>;
const fetchLoanBalancesMock = fetchLoanBalances as jest.MockedFunction<typeof fetchLoanBalances>;
const fetchLoanCurrentDueOnMock = fetchLoanCurrentDueOn as jest.MockedFunction<
  typeof fetchLoanCurrentDueOn
>;
const fetchLoanItemsMock = fetchLoanItems as jest.MockedFunction<typeof fetchLoanItems>;
const fetchOverdueLoansMock = fetchOverdueLoans as jest.MockedFunction<typeof fetchOverdueLoans>;
const resolveReceiptDisplayUrlMock = resolveReceiptDisplayUrl as jest.MockedFunction<
  typeof resolveReceiptDisplayUrl
>;

const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 851 },
  insets: { top: 24, left: 0, right: 0, bottom: 48 },
};

const BALANCES: LoanBalances = {
  accruedInterestPaise: 0,
  outstandingPrincipalPaise: 1000000,
  totalDuePaise: 1000000,
  interestPaidPaise: 0,
  principalPaidPaise: 0,
  overpaymentRefundedPaise: 0,
};

function sampleLoan(): LoanWithCustomer {
  return {
    id: 'loan-1',
    customer_id: 'cust-1',
    serial_number: 'G-1001',
    receipt_image_url: null,
    item_name: 'Chain',
    weight_grams: 10,
    principal_paise: 1000000,
    rate_bps: 300,
    disbursed_on: '2026-01-01',
    interest_model: 'retail',
    simple_period_days: 30,
    compound_every_days: 30,
    grace_days: 0,
    partial_period_mode: 'pro_rata',
    round_up_threshold_days: 15,
    status: 'active',
    redeemed_on: null,
    redeemed_by: null,
    released_to_name: null,
    release_note: null,
    closure_balance_paise: null,
    digital_signature_url: null,
    release_signature_url: null,
    defaulted_on: null,
    defaulted_by: null,
    default_balance_paise: null,
    default_reason: null,
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    archive_balance_paise: null,
    public_token: 'test-public-token',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
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

function authValue(role: 'staff' | 'owner') {
  return {
    session: { user: { id: 'user-1' } },
    profile: { id: 'user-1', role, full_name: 'Test', phone_number: '+919000000002' },
    isLoading: false,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
  };
}

function thenable<T extends { data: unknown; error: null }>(result: T) {
  const chain: {
    select: jest.Mock;
    eq: jest.Mock;
    order: jest.Mock;
    maybeSingle: jest.Mock;
    then: (resolve: (value: T) => unknown) => Promise<unknown>;
  } = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    maybeSingle: jest.fn(async () => result),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  return chain;
}

function renderDetail() {
  return render(
    <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
      <LoanDetailScreen />
    </SafeAreaProvider>,
  );
}

describe('loan detail archive action', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    mockBack.mockClear();
    fromMock.mockImplementation((table: string) => {
      if (table === 'loans') {
        return thenable({ data: sampleLoan(), error: null }) as never;
      }
      return thenable({ data: [], error: null }) as never;
    });
    fetchLoanBalancesMock.mockResolvedValue(BALANCES);
    fetchLoanCurrentDueOnMock.mockResolvedValue('2026-01-31');
    fetchLoanItemsMock.mockResolvedValue([]);
    fetchOverdueLoansMock.mockResolvedValue([]);
    resolveReceiptDisplayUrlMock.mockResolvedValue(null);
  });

  test('does not render Archive for role staff', async () => {
    useAuthMock.mockReturnValue(authValue('staff') as never);

    const { queryByTestId, getAllByText } = await renderDetail();

    await waitFor(() => {
      expect(getAllByText('G-1001').length).toBeGreaterThan(0);
    });
    expect(queryByTestId('open-archive')).toBeNull();
  });

  test('renders Archive for role owner', async () => {
    useAuthMock.mockReturnValue(authValue('owner') as never);

    const { getByTestId, getAllByText, queryByTestId } = await renderDetail();

    await waitFor(() => {
      expect(getAllByText('G-1001').length).toBeGreaterThan(0);
    });
    getByTestId('open-archive');
    expect(queryByTestId('open-unredeem')).toBeNull();
  });

  test('owner can mark a redeemed loan unpaid', async () => {
    useAuthMock.mockReturnValue(authValue('owner') as never);
    fromMock.mockImplementation((table: string) => {
      if (table === 'loans') {
        return thenable({
          data: {
            ...sampleLoan(),
            status: 'redeemed',
            redeemed_on: '2026-01-31',
            redeemed_by: 'user-1',
            closure_balance_paise: 1030000,
            released_to_name: 'Asha Patil',
          },
          error: null,
        }) as never;
      }
      return thenable({ data: [], error: null }) as never;
    });

    const { getByTestId, getAllByText } = await renderDetail();

    await waitFor(() => {
      expect(getAllByText('G-1001').length).toBeGreaterThan(0);
    });
    getByTestId('open-unredeem');
  });
});
