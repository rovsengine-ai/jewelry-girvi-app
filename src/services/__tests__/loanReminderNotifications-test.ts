import { syncLoanReminderNotifications } from '@/services/loanReminderNotifications';

jest.mock('@/lib/local-notifications', () => ({
  AndroidImportance: { HIGH: 6 },
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => [
    { identifier: 'girvi:due_soon:loan-1' },
  ]),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const {
  cancelScheduledNotificationAsync,
  scheduleNotificationAsync,
  getAllScheduledNotificationsAsync,
} = jest.requireMock('@/lib/local-notifications') as {
  cancelScheduledNotificationAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  getAllScheduledNotificationsAsync: jest.Mock;
};

describe('syncLoanReminderNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAllScheduledNotificationsAsync.mockResolvedValue([{ identifier: 'girvi:due_soon:loan-1' }]);
  });

  test('skips scheduling when preferRemotePush is true (no dual fire)', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const scheduled = await syncLoanReminderNotifications(
      [
        {
          loan_id: 'loan-1',
          serial_number: 'T-1',
          due_on: '2024-06-29',
          reminder_kind: 'due_soon',
          fire_at: future,
        },
      ],
      Date.now(),
      { preferRemotePush: true },
    );

    expect(scheduled).toBe(0);
    expect(cancelScheduledNotificationAsync).toHaveBeenCalled();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
