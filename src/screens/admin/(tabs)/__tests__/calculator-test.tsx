import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

const mockQuoteLoanPayoff = jest.fn();

jest.mock('@/services/loanService', () => ({
  quoteLoanPayoff: (...args: unknown[]) => mockQuoteLoanPayoff(...args),
}));

import { useAuth } from '@/providers/auth-provider';

import ShopCalculatorScreen, { parseCalculatorIsoDate } from '../calculator';

const useAuthMock = useAuth as jest.MockedFunction<typeof useAuth>;

function authValue(role: 'staff' | 'owner' | 'retail_customer') {
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

function renderCalculator() {
  return render(
    <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
      <ShopCalculatorScreen />
    </SafeAreaProvider>,
  );
}

describe('parseCalculatorIsoDate', () => {
  test('accepts a real calendar date', () => {
    expect(parseCalculatorIsoDate('2024-02-29')).toBe('2024-02-29');
  });

  test('rejects impossible dates and junk', () => {
    expect(parseCalculatorIsoDate('2023-02-29')).toBeNull();
    expect(parseCalculatorIsoDate('01-01-2024')).toBeNull();
    expect(parseCalculatorIsoDate('')).toBeNull();
  });
});

describe('Shop calculator', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockQuoteLoanPayoff.mockReset();
  });

  test('staff is not redirected away from the calculator', async () => {
    useAuthMock.mockReturnValue(authValue('staff') as never);

    const { getByText } = await renderCalculator();

    await waitFor(() => {
      getByText('Payoff calculator');
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('owner is not redirected away from the calculator', async () => {
    useAuthMock.mockReturnValue(authValue('owner') as never);

    const { getByText } = await renderCalculator();

    await waitFor(() => {
      getByText('Payoff calculator');
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('quotes a payoff from amount and dates via SQL', async () => {
    useAuthMock.mockReturnValue(authValue('staff') as never);
    mockQuoteLoanPayoff.mockResolvedValue({
      principalPaise: 5000000,
      accruedInterestPaise: 150000,
      totalDuePaise: 5150000,
      daysElapsed: 5,
      completePeriods: 0,
      remainderDays: 5,
      remainderRoundedUp: false,
      firstMonthFloorApplied: true,
      capitalized: false,
      periodInterestPaise: 150000,
      rateBps: 300,
      interestModel: 'retail',
      partialPeriodMode: 'min_month_then_pro_rata',
      roundUpThresholdDays: 24,
      simplePeriodDays: 180,
      disbursedOn: '2024-01-01',
      asOf: '2024-01-06',
      why: 'first_month_floor',
    });

    const { getByTestId } = await renderCalculator();

    fireEvent.changeText(getByTestId('calculator-amount'), '50000');
    fireEvent.changeText(getByTestId('calculator-pledge-date'), '2024-01-01');
    fireEvent.changeText(getByTestId('calculator-pay-on'), '2024-01-06');
    await waitFor(() => {
      expect(getByTestId('calculator-amount').props.value).toBe('50000');
    });
    fireEvent.press(getByTestId('calculator-submit'));

    await waitFor(() => {
      expect(mockQuoteLoanPayoff).toHaveBeenCalledWith({
        principalPaise: 5000000,
        disbursedOn: '2024-01-01',
        asOf: '2024-01-06',
        interestModel: 'retail',
      });
    });
  });
});
