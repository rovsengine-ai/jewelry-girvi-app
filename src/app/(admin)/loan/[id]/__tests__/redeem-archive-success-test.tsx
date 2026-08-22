import { fireEvent, render, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LoanBalances, LoanItem, LoanWithCustomer } from '@/types/database';

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

jest.mock('@/components/signature-pad', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SignaturePad: React.forwardRef(function MockSignaturePad(_props: unknown, ref: unknown) {
      React.useImperativeHandle(ref, () => ({
        readSignature: jest.fn(async () => null),
        clearSignature: jest.fn(),
      }));
      return React.createElement(View, { testID: 'mock-signature-pad' });
    }),
  };
});

jest.mock('@/services/loanService', () => ({
  archiveLoan: jest.fn(),
  fetchLoanBalances: jest.fn(),
  fetchLoanItems: jest.fn(),
  redeemLoan: jest.fn(),
  resolveReceiptDisplayUrl: jest.fn(async () => null),
  uploadSignatureDataUrl: jest.fn(),
}));

import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/lib/supabase';
import {
  archiveLoan,
  fetchLoanBalances,
  fetchLoanItems,
  redeemLoan,
} from '@/services/loanService';

import RedeemLoanScreen from '../redeem';

const useAuthMock = useAuth as jest.MockedFunction<typeof useAuth>;
const fromMock = supabase.from as jest.MockedFunction<typeof supabase.from>;
const fetchLoanBalancesMock = fetchLoanBalances as jest.MockedFunction<typeof fetchLoanBalances>;
const fetchLoanItemsMock = fetchLoanItems as jest.MockedFunction<typeof fetchLoanItems>;
const redeemLoanMock = redeemLoan as jest.MockedFunction<typeof redeemLoan>;
const archiveLoanMock = archiveLoan as jest.MockedFunction<typeof archiveLoan>;

const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 851 },
  insets: { top: 24, left: 0, right: 0, bottom: 48 },
};

const BALANCES: LoanBalances = {
  accruedInterestPaise: 0,
  outstandingPrincipalPaise: 1000000,
  totalDuePaise: 0,
  interestPaidPaise: 0,
  principalPaidPaise: 1000000,
  overpaymentRefundedPaise: 0,
};

const ITEM: LoanItem = {
  id: 'item-1',
  loan_id: 'loan-1',
  position: 1,
  ornament_type: 'chain',
  description: 'Gold chain',
  metal: 'gold',
  gross_weight_mg: 10000,
    net_weight_mg: 10000,
    purity_karat: 22,
    stone_deduction_mg: 0,
    quantity: 1,
    created_at: '2026-01-01T00:00:00Z',
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

function renderRedeem() {
  return render(
    <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
      <RedeemLoanScreen />
    </SafeAreaProvider>,
  );
}

async function redeemToSuccess() {
  const user = userEvent.setup();
  const view = await renderRedeem();

  await waitFor(() => {
    expect(view.getByTestId('confirm-redeem')).toBeTruthy();
  });

  fireEvent.press(view.getByTestId('item-check-1'));
  await user.press(view.getByTestId('confirm-redeem'));

  await waitFor(() => {
    expect(view.getByTestId('open-archive-after-redeem')).toBeTruthy();
  });

  return view;
}

describe('redeem success archive action', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    fromMock.mockImplementation((table: string) => {
      if (table === 'loans') {
        return thenable({ data: sampleLoan(), error: null }) as never;
      }
      return thenable({ data: [], error: null }) as never;
    });
    fetchLoanBalancesMock.mockResolvedValue(BALANCES);
    fetchLoanItemsMock.mockResolvedValue([ITEM]);
    redeemLoanMock.mockResolvedValue({
      loan_id: 'loan-1',
      status: 'redeemed',
      redeemed_on: '2026-08-16',
      redeemed_by: 'user-1',
      closure_balance_paise: 0,
      already_redeemed: false,
    });
    archiveLoanMock.mockResolvedValue({
      loan_id: 'loan-1',
      archived_at: '2026-08-16T10:00:00Z',
      archived_by: 'user-1',
      archive_reason: 'Customer collected items',
      archive_balance_paise: 0,
      already_archived: false,
    });
  });

  test('shows Archive now for owner after a successful redeem', async () => {
    useAuthMock.mockReturnValue(authValue('owner') as never);

    const { getByTestId } = await redeemToSuccess();

    getByTestId('open-archive-after-redeem');
  });

  test('archives from success screen with typed reason', async () => {
    useAuthMock.mockReturnValue(authValue('owner') as never);
    const user = userEvent.setup();

    const { getByTestId, getByText, queryByTestId } = await redeemToSuccess();

    await user.press(getByTestId('open-archive-after-redeem'));
    expect(getByTestId('archive-confirm')).toBeTruthy();

    fireEvent.changeText(getByTestId('archive-reason'), 'Customer collected items');
    await waitFor(() => {
      expect(getByTestId('archive-confirm-button').props.accessibilityState).toMatchObject({
        disabled: false,
      });
    });
    fireEvent.press(getByTestId('archive-confirm-button'));

    await waitFor(() => {
      expect(archiveLoanMock).toHaveBeenCalledWith({
        loanId: 'loan-1',
        reason: 'Customer collected items',
      });
    });

    expect(getByTestId('screen-notice')).toBeTruthy();
    expect(getByText('This girvi is already archived. The shop still has the record.')).toBeTruthy();
    expect(queryByTestId('open-archive-after-redeem')).toBeNull();
  });
});
