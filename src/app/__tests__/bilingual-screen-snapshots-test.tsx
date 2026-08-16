/**
 * Bilingual screen snapshots — catch Hindi string layout drift via visible
 * text trees (not full native host trees). Pixel clipping is Maestro on device.
 */
import { type ReactElement } from 'react';
import { act } from '@testing-library/react-native';

import {
  getSnapshotLanguage,
  renderForSnapshot,
  setSnapshotLanguage,
} from '@/test/bilingual-snapshot';
import type { AppLanguage } from '@/i18n';

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: View,
    Swipeable: View,
    State: {},
    PanGestureHandler: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    TouchableOpacity: View,
    Directions: {},
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: { children?: React.ReactNode }, _ref: unknown) =>
      React.createElement(View, null, props.children),
    ),
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@/components/glass-surface', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GlassSurface: ({ children, style }: { children?: React.ReactNode; style?: unknown }) =>
      React.createElement(View, { style }, children),
  };
});

jest.mock('@/providers/language-provider', () => {
  const i18n = require('@/i18n') as typeof import('@/i18n');
  const state = require('@/test/bilingual-snapshot') as typeof import('@/test/bilingual-snapshot');
  // Stable `t` — screens that list `t` in effect deps must not loop forever.
  const t = (key: string, options?: Record<string, string | number>) =>
    i18n.translate(key, options, state.getSnapshotLanguage());
  return {
    useLanguage: () => ({
      language: state.getSnapshotLanguage(),
      setLanguage: (next: import('@/i18n').AppLanguage) => {
        state.setSnapshotLanguage(next);
      },
      t,
    }),
    LanguageProvider: ({ children }: { children: React.ReactNode }) => children,
    useI18nLocale: () => state.getSnapshotLanguage(),
  };
});

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: 'loan-1', customerId: 'cust-1' }),
  useSegments: () => [],
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: jest.fn(),
  routeForRole: jest.fn(() => '/(admin)/(tabs)/loans'),
}));

jest.mock('@/lib/supabase', () => {
  const makeChain = () => {
    const result = { data: [] as unknown[], error: null as null };
    const chain: Record<string, unknown> = {};
    const api = {
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      catch: (reject: (reason: unknown) => unknown) => Promise.resolve(result).catch(reject),
    };
    for (const key of ['select', 'eq', 'is', 'order', 'limit', 'update', 'insert', 'delete']) {
      chain[key] = jest.fn(() => Object.assign(chain, api));
    }
    chain.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
    chain.single = jest.fn(async () => ({ data: null, error: null }));
    return Object.assign(chain, api);
  };
  return {
    supabase: {
      from: jest.fn(() => makeChain()),
      auth: {
        signInWithOtp: jest.fn(async () => ({ error: null })),
        verifyOtp: jest.fn(async () => ({ data: { user: null }, error: null })),
      },
      functions: { invoke: jest.fn() },
      rpc: jest.fn(),
    },
  };
});

jest.mock('@/services/loanService', () => ({
  fetchRateYield: jest.fn(async () => []),
  fetchShopDefaults: jest.fn(async () => ({
    rate_bps: 300,
    simple_period_days: 180,
    compound_every_days: 30,
    grace_days: 0,
    round_up_threshold_days: 24,
    partial_period_mode: 'min_month_then_pro_rata',
  })),
  updateShopDefaults: jest.fn(),
  fetchLoanNotices: jest.fn(async () => []),
  fetchOverdueLoans: jest.fn(async () => []),
  generateLoanNotices: jest.fn(async () => 0),
  fetchArchivedLoans: jest.fn(async () => []),
  unarchiveLoan: jest.fn(),
  archiveLoan: jest.fn(),
  fetchLoanBalances: jest.fn(async () => null),
  fetchLoanCurrentDueOn: jest.fn(async () => null),
  fetchLoanItems: jest.fn(async () => []),
  fetchLoanItemPhotos: jest.fn(async () => []),
  logPayment: jest.fn(),
  resolveReceiptDisplayUrl: jest.fn(async () => null),
  unredeemLoan: jest.fn(),
  redeemLoan: jest.fn(),
  renewLoan: jest.fn(),
  defaultLoan: jest.fn(),
  updateLoanTerms: jest.fn(),
}));

jest.mock('@/services/printService', () => ({
  shareHtmlAsPdf: jest.fn(),
}));

jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('react-native-signature-canvas', () => 'SignatureCanvas');

jest.mock('@/hooks/use-tab-bar-scroll-padding', () => ({
  useTabBarScrollPadding: () => 64,
}));

jest.mock('@/hooks/use-reduce-motion', () => ({
  useReduceMotion: () => true,
}));

import { useAuth } from '@/providers/auth-provider';

import LoginScreen from '@/app/(auth)/login';
import AdminLoansScreen from '@/app/(admin)/(tabs)/loans';
import AdminAlertsScreen from '@/app/(admin)/(tabs)/alerts';
import AdminInsightsScreen from '@/app/(admin)/(tabs)/insights';
import AdminSettingsScreen from '@/app/(admin)/(tabs)/settings';
import AdminArchiveScreen from '@/app/(admin)/archive';
import AdminScannerScreen from '@/app/(admin)/scanner';
import CustomerLoansScreen from '@/app/(customer)/(tabs)/loans';
import CustomerAlertsScreen from '@/app/(customer)/(tabs)/alerts';
import CustomerSettingsScreen from '@/app/(customer)/(tabs)/settings';

const useAuthMock = useAuth as jest.MockedFunction<typeof useAuth>;

function auth(role: 'owner' | 'staff' | 'retail_customer') {
  return {
    session: { user: { id: 'user-1' } },
    profile: {
      id: 'user-1',
      role,
      full_name: 'Snapshot User',
      phone_number: '+919000000001',
    },
    isLoading: false,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
  };
}

const LANGUAGES: AppLanguage[] = ['en', 'hi'];

function collectTextFromJson(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string') {
      const trimmed = n.trim();
      if (trimmed) out.push(trimmed);
      return;
    }
    if (Array.isArray(n)) {
      for (const child of n) walk(child);
      return;
    }
    if (typeof n === 'object' && n !== null && 'children' in n) {
      walk((n as { children?: unknown }).children);
    }
  };
  walk(node);
  return out;
}

async function snap(name: string, makeUi: () => ReactElement) {
  for (const language of LANGUAGES) {
    setSnapshotLanguage(language);
    const tree = await renderForSnapshot(makeUi());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(collectTextFromJson(tree.toJSON())).toMatchSnapshot(`${name}-${getSnapshotLanguage()}`);
    tree.unmount();
  }
}

describe('bilingual screen snapshots', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    setSnapshotLanguage('en');
  });

  test('auth login', async () => {
    useAuthMock.mockReturnValue(auth('owner') as never);
    await snap('login', () => <LoginScreen />);
  });

  test('admin loans', async () => {
    useAuthMock.mockReturnValue(auth('owner') as never);
    await snap('admin-loans', () => <AdminLoansScreen />);
  });

  test('admin alerts', async () => {
    useAuthMock.mockReturnValue(auth('owner') as never);
    await snap('admin-alerts', () => <AdminAlertsScreen />);
  });

  test('admin insights', async () => {
    useAuthMock.mockReturnValue(auth('owner') as never);
    await snap('admin-insights', () => <AdminInsightsScreen />);
  });

  test('admin settings', async () => {
    useAuthMock.mockReturnValue(auth('owner') as never);
    await snap('admin-settings', () => <AdminSettingsScreen />);
  });

  test('admin archive', async () => {
    useAuthMock.mockReturnValue(auth('owner') as never);
    await snap('admin-archive', () => <AdminArchiveScreen />);
  });

  test('admin scanner', async () => {
    useAuthMock.mockReturnValue(auth('staff') as never);
    await snap('admin-scanner', () => <AdminScannerScreen />);
  });

  test('customer loans', async () => {
    useAuthMock.mockReturnValue(auth('retail_customer') as never);
    await snap('customer-loans', () => <CustomerLoansScreen />);
  });

  test('customer alerts', async () => {
    useAuthMock.mockReturnValue(auth('retail_customer') as never);
    await snap('customer-alerts', () => <CustomerAlertsScreen />);
  });

  test('customer settings', async () => {
    useAuthMock.mockReturnValue(auth('retail_customer') as never);
    await snap('customer-settings', () => <CustomerSettingsScreen />);
  });
});
