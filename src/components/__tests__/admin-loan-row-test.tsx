import { fireEvent, render, userEvent, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import { AdminLoanRow } from '@/components/admin-loan-row';
import type { LoanWithCustomer } from '@/types/database';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-linking', () => ({
  openURL: jest.fn(async () => undefined),
}));

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');

  const MockSwipeable = React.forwardRef(
    (
      {
        children,
        renderRightActions,
        onSwipeableOpen,
        testID,
      }: {
        children?: React.ReactNode;
        renderRightActions?: (
          progress: { value: number },
          translation: { value: number },
          methods: { close: () => void },
        ) => React.ReactNode;
        onSwipeableOpen?: (direction: string) => void;
        testID?: string;
      },
      ref: React.Ref<{ close: () => void }>,
    ) => {
      const close = jest.fn();
      React.useImperativeHandle(ref, () => ({
        close,
        openLeft: jest.fn(),
        openRight: jest.fn(),
        reset: jest.fn(),
      }));
      return (
        <View testID={testID}>
          {children}
          <Pressable
            testID="swipe-open-trigger"
            accessibilityRole="button"
            onPress={() => onSwipeableOpen?.('left')}
          />
          {renderRightActions?.({ value: 1 }, { value: 0 }, { close })}
        </View>
      );
    },
  );
  MockSwipeable.displayName = 'MockReanimatedSwipeable';
  return { __esModule: true, default: MockSwipeable };
});

function sampleLoan(overrides: Partial<LoanWithCustomer> = {}): LoanWithCustomer {
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
      id_document_last4: null,
      id_document_path: null,
    },
    ...overrides,
  };
}

describe('<AdminLoanRow />', () => {
  test('staff does not render Archive', async () => {
    const { queryByTestId, getByTestId } = await render(
      <AdminLoanRow
        loan={sampleLoan()}
        index={0}
        reduceMotion
        canArchive={false}
        onPress={() => undefined}
        onArchive={jest.fn()}
      />,
    );
    getByTestId('loan-row-call');
    expect(queryByTestId('loan-row-archive')).toBeNull();
  });

  test('opening swipe does not show confirm or archive', async () => {
    const onArchive = jest.fn();
    const { getByTestId, queryByTestId } = await render(
      <AdminLoanRow
        loan={sampleLoan()}
        index={0}
        reduceMotion
        canArchive
        onPress={() => undefined}
        onArchive={onArchive}
      />,
    );

    fireEvent.press(getByTestId('swipe-open-trigger'));
    expect(queryByTestId('archive-confirm')).toBeNull();
    expect(onArchive).not.toHaveBeenCalled();
  });

  test('Archive confirm stays disabled until a reason is typed', async () => {
    const user = userEvent.setup();
    const onArchive = jest.fn(async () => undefined);
    const { getByTestId } = await render(
      <AdminLoanRow
        loan={sampleLoan()}
        index={0}
        reduceMotion
        canArchive
        onPress={() => undefined}
        onArchive={onArchive}
      />,
    );

    await user.press(getByTestId('loan-row-archive'));
    getByTestId('archive-confirm');
    expect(onArchive).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('archive-confirm-button'));
    expect(onArchive).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId('archive-reason'), '  Duplicate ticket  ');
    await waitFor(() => {
      expect(getByTestId('archive-confirm-button').props.accessibilityState).toMatchObject({
        disabled: false,
      });
    });
    fireEvent.press(getByTestId('archive-confirm-button'));
    await waitFor(() => {
      expect(onArchive).toHaveBeenCalledWith('Duplicate ticket');
    });
  });

  test('Call opens a tel: URL', async () => {
    const user = userEvent.setup();
    const { getByTestId } = await render(
      <AdminLoanRow
        loan={sampleLoan()}
        index={0}
        reduceMotion
        canArchive={false}
        onPress={() => undefined}
        onArchive={jest.fn()}
      />,
    );

    await user.press(getByTestId('loan-row-call'));
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+919876543210');
  });

  test('hides Call when the customer has no phone', async () => {
    const { queryByTestId } = await render(
      <AdminLoanRow
        loan={sampleLoan({
          profiles: {
            full_name: 'Asha Patil',
            phone_number: null,
            address: null,
            role: 'retail_customer',
            id_document_type: null,
            kyc_verified_on: null,
            guardian_name: null,
      photo_path: null,
      id_document_last4: null,
      id_document_path: null,
          },
        })}
        index={0}
        reduceMotion
        canArchive
        onPress={() => undefined}
        onArchive={jest.fn()}
      />,
    );

    expect(queryByTestId('loan-row-call')).toBeNull();
    expect(queryByTestId('loan-row-archive')).not.toBeNull();
  });
});
