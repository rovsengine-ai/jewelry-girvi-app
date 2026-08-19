import {
  archiveLoan,
  createLoanWithCustomer,
  createWalkInCustomer,
  defaultLoan,
  editLoanTerms,
  fetchArchivedLoans,
  fetchCustomerLoanReminders,
  fetchLoanBalances,
  fetchLoansConcealed,
  fetchOverdueLoans,
  fetchRateYield,
  findCustomerIdByPhone,
  findLoanBySerial,
  generateLoanNotices,
  LoanPhotosIncompleteError,
  logPayment,
  SerialExistsError,
  redeemLoan,
  renewLoan,
  resolveReceiptDisplayUrl,
  setLoansConcealed,
  unarchiveLoan,
  unredeemLoan,
  updateShopDefaults,
  uploadImageToStorage,
} from '@/services/loanService';
import type { ScannerItemDraft } from '@/lib/scanner-items';
import type { LoanFormData, ShopDefaults } from '@/types/database';

jest.mock('@/lib/prepare-item-photo', () => ({
  prepareItemPhoto: jest.fn(async (uri: string) => ({ uri, mimeType: 'image/jpeg' as const })),
}));

jest.mock('@/lib/supabase', () => {
  const createSignedUrl = jest.fn();
  const upload = jest.fn();
  const storageFrom = jest.fn(() => ({ createSignedUrl, upload }));
  const invoke = jest.fn();
  const rpc = jest.fn();
  const getSession = jest.fn();
  const refreshSession = jest.fn();
  return {
    __storageMocks: { createSignedUrl, upload, storageFrom, invoke, rpc, getSession, refreshSession },
    supabase: {
      storage: { from: storageFrom },
      functions: { invoke },
      from: jest.fn(),
      rpc,
      auth: { getSession, refreshSession },
    },
  };
});

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  cacheDirectory: 'file:///cache/',
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('@/services/kycService', () => ({
  saveKycCapture: jest.fn(async () => undefined),
  uploadKycImage: jest.fn(async () => 'f47ac10b-58cc-4372-a567-0e02b2c3d479/id-doc.jpg'),
  uploadCustomerPhoto: jest.fn(async () => 'f47ac10b-58cc-4372-a567-0e02b2c3d479/photo/face.jpg'),
}));

const saveKycCaptureMock = jest.requireMock('@/services/kycService').saveKycCapture as jest.Mock;
const uploadKycImageMock = jest.requireMock('@/services/kycService').uploadKycImage as jest.Mock;
const uploadCustomerPhotoMock = jest.requireMock('@/services/kycService').uploadCustomerPhoto as jest.Mock;

const { createSignedUrl, upload, storageFrom, invoke, rpc, getSession, refreshSession } = (
  jest.requireMock('@/lib/supabase') as {
    __storageMocks: {
      createSignedUrl: jest.Mock;
      upload: jest.Mock;
      storageFrom: jest.Mock;
      invoke: jest.Mock;
      rpc: jest.Mock;
      getSession: jest.Mock;
      refreshSession: jest.Mock;
    };
  }
).__storageMocks;

const CUSTOMER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VALID_PATH = `${CUSTOMER}/receipts/1699-abc.jpg`;

beforeEach(() => {
  jest.clearAllMocks();
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/x' }, error: null });
  upload.mockResolvedValue({ error: null });
  getSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'user-jwt',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    },
    error: null,
  });
  refreshSession.mockResolvedValue({ data: { session: null }, error: null });
});

describe('resolveReceiptDisplayUrl', () => {
  test('returns null for no stored value without touching storage', async () => {
    await expect(resolveReceiptDisplayUrl(null)).resolves.toBeNull();
    await expect(resolveReceiptDisplayUrl('')).resolves.toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  test('signs a stored namespaced path with a one-hour TTL', async () => {
    await expect(resolveReceiptDisplayUrl(VALID_PATH)).resolves.toBe('https://signed.example/x');
    expect(storageFrom).toHaveBeenCalledWith('receipts');
    expect(createSignedUrl).toHaveBeenCalledWith(VALID_PATH, 3600);
  });

  test('accepts the signatures folder too', async () => {
    await resolveReceiptDisplayUrl(`${CUSTOMER}/signatures/sig.png`);
    expect(createSignedUrl).toHaveBeenCalledWith(`${CUSTOMER}/signatures/sig.png`, 3600);
  });

  test('accepts the items folder added for pledged-item photos', async () => {
    // Item photos share the private receipts bucket rather than getting their
    // own, because the five receipts_* storage policies already constrain the
    // first path segment to a customer uuid and ignore the second.
    await resolveReceiptDisplayUrl(`${CUSTOMER}/items/bangle-1.jpg`);
    expect(storageFrom).toHaveBeenCalledWith('receipts');
    expect(createSignedUrl).toHaveBeenCalledWith(`${CUSTOMER}/items/bangle-1.jpg`, 3600);
  });

  test('still rejects a folder outside the allowlist', async () => {
    await expect(resolveReceiptDisplayUrl(`${CUSTOMER}/kyc/pan.jpg`)).rejects.toThrow(
      'Invalid storage object path.',
    );
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  test('normalizes leading slashes before signing', async () => {
    await resolveReceiptDisplayUrl(`///${VALID_PATH}`);
    expect(createSignedUrl).toHaveBeenCalledWith(VALID_PATH, 3600);
  });

  test('extracts the path from a legacy public URL', async () => {
    await resolveReceiptDisplayUrl(
      `https://proj.supabase.co/storage/v1/object/public/receipts/${VALID_PATH}`,
    );
    expect(createSignedUrl).toHaveBeenCalledWith(VALID_PATH, 3600);
  });

  test('handles the authenticated and signed URL forms, dropping any query string', async () => {
    await resolveReceiptDisplayUrl(
      `https://proj.supabase.co/storage/v1/object/authenticated/receipts/${VALID_PATH}`,
    );
    expect(createSignedUrl).toHaveBeenCalledWith(VALID_PATH, 3600);

    createSignedUrl.mockClear();
    await resolveReceiptDisplayUrl(
      `https://proj.supabase.co/storage/v1/object/sign/receipts/${VALID_PATH}?token=abc.def`,
    );
    expect(createSignedUrl).toHaveBeenCalledWith(VALID_PATH, 3600);
  });

  test('percent-decodes an encoded legacy path', async () => {
    await resolveReceiptDisplayUrl(
      `https://proj.supabase.co/storage/v1/object/public/receipts/${CUSTOMER}%2Freceipts%2Fa.jpg`,
    );
    expect(createSignedUrl).toHaveBeenCalledWith(`${CUSTOMER}/receipts/a.jpg`, 3600);
  });

  test('returns a non-storage http URL untouched', async () => {
    const external = 'https://example.com/not-a-storage-url.jpg';
    await expect(resolveReceiptDisplayUrl(external)).resolves.toBe(external);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  test('surfaces a storage error as an Error', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    await expect(resolveReceiptDisplayUrl(VALID_PATH)).rejects.toThrow('Object not found');
  });

  describe('rejects unsafe paths before any SDK call', () => {
    test.each([
      [`${CUSTOMER}/receipts/../../etc/passwd`, 'parent traversal'],
      [`${CUSTOMER}/receipts/..%2Fx.jpg`, 'encoded traversal remnant'],
      [`${CUSTOMER}/..`, 'bare dot-dot'],
      ['loose-receipt.jpg', 'no customer namespace'],
      [`${CUSTOMER}/private/x.jpg`, 'folder outside the allowlist'],
      [`${CUSTOMER}/receipts/sub/dir/x.jpg`, 'nested subdirectory'],
      [`${CUSTOMER}/receipts/file name.jpg`, 'space in filename'],
      ['not-a-uuid/receipts/x.jpg', 'non-uuid first segment'],
      [`${CUSTOMER}/receipts/`, 'empty filename'],
    ])('%p (%s)', async (path) => {
      await expect(resolveReceiptDisplayUrl(path)).rejects.toThrow('Invalid storage object path.');
      expect(createSignedUrl).not.toHaveBeenCalled();
    });
  });

  test('FLAGGED: the backslash guard in assertSafeStoragePath is unreachable', async () => {
    // assertSafeStoragePath normalizes '\' to '/' on its first line and only
    // then tests normalized.includes('\\'), so that check can never fire. A
    // Windows-style path is quietly rewritten into a valid one and signed rather
    // than rejected. Harmless today (the result is still namespaced and the
    // regex still applies), but the guard reads as protection it does not give.
    await expect(
      resolveReceiptDisplayUrl(`${CUSTOMER}\\receipts\\x.jpg`),
    ).resolves.toBe('https://signed.example/x');
    expect(createSignedUrl).toHaveBeenCalledWith(`${CUSTOMER}/receipts/x.jpg`, 3600);
  });

  test('FLAGGED: a legacy public URL with no customer prefix throws instead of rendering', async () => {
    // Receipts uploaded before path-namespacing was introduced sit at the bucket
    // root, so storagePathFromLegacyUrl yields '1699-abc.jpg', which fails
    // SAFE_STORAGE_PATH_RE. src/app/(admin)/loan/[id]/index.tsx does not catch this, so
    // an old loan's detail screen surfaces a raw error rather than a missing
    // image. Asserted as current behaviour; migrating those objects is a
    // separate decision.
    await expect(
      resolveReceiptDisplayUrl(
        'https://proj.supabase.co/storage/v1/object/public/receipts/1699-abc.jpg',
      ),
    ).rejects.toThrow('Invalid storage object path.');
  });
});

describe('uploadImageToStorage', () => {
  test('refuses a customer id that is not a uuid, before reading the file', async () => {
    await expect(uploadImageToStorage('file:///tmp/a.jpg', 'receipts', 'nope')).rejects.toThrow(
      'Invalid customer id for storage path.',
    );
    expect(upload).not.toHaveBeenCalled();
  });

  test('writes under {customer_id}/{folder}/ and returns the stored path', async () => {
    const stored = await uploadImageToStorage('file:///tmp/photo.jpg', 'receipts', CUSTOMER);
    expect(stored).toMatch(
      new RegExp(`^${CUSTOMER}/receipts/\\d+-[a-z0-9]+\\.jpg$`),
    );
    expect(upload).toHaveBeenCalledWith(stored, expect.any(Uint8Array), {
      contentType: 'image/jpeg',
      upsert: false,
    });
  });

  test('never overwrites an existing object', async () => {
    await uploadImageToStorage('file:///tmp/photo.jpg', 'receipts', CUSTOMER);
    expect(upload.mock.calls[0][2]).toMatchObject({ upsert: false });
  });

  test('keeps png and sets the matching content type', async () => {
    const stored = await uploadImageToStorage('file:///tmp/sig.PNG', 'signatures', CUSTOMER);
    expect(stored).toMatch(new RegExp(`^${CUSTOMER}/signatures/\\d+-[a-z0-9]+\\.png$`));
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/png' });
  });

  test.each([
    ['file:///tmp/evil.php', 'executable extension'],
    ['file:///tmp/archive.zip', 'unexpected extension'],
    ['file:///tmp/noextension', 'no extension at all'],
    ['file:///tmp/weird.j%pg', 'punctuation in the extension'],
  ])('coerces %p (%s) to .jpg', async (uri) => {
    const stored = await uploadImageToStorage(uri, 'receipts', CUSTOMER);
    expect(stored.endsWith('.jpg')).toBe(true);
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/jpeg' });
  });

  test('surfaces an upload error as an Error', async () => {
    upload.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });
    await expect(uploadImageToStorage('file:///tmp/a.jpg', 'receipts', CUSTOMER)).rejects.toThrow(
      'new row violates row-level security policy',
    );
  });

  test('writes an item photo under {customer_id}/items/', async () => {
    // The path shape is also enforced in Postgres by loan_item_photos_path_chk,
    // so a mismatch here would be rejected on insert rather than stored badly.
    const stored = await uploadImageToStorage('file:///tmp/bangle.jpg', 'items', CUSTOMER);
    expect(stored).toMatch(new RegExp(`^${CUSTOMER}/items/\\d+-[a-z0-9]+\\.jpg$`));
    expect(storageFrom).toHaveBeenCalledWith('receipts');
  });
});

describe('createWalkInCustomer', () => {
  test('registers the customer through the Edge Function and returns the id', async () => {
    invoke.mockResolvedValue({ data: { customer_id: CUSTOMER, created: true }, error: null });

    await expect(createWalkInCustomer('98765 43210', 'Asha Patil', 'Pune')).resolves.toBe(CUSTOMER);
    expect(invoke).toHaveBeenCalledWith('create-walkin-customer', {
      headers: { Authorization: 'Bearer user-jwt' },
      body: {
        phone_number: '+919876543210',
        full_name: 'Asha Patil',
        address: 'Pune',
        role: 'retail_customer',
      },
    });
  });

  test('sends merchant role when registering a merchant walk-in', async () => {
    invoke.mockResolvedValue({ data: { customer_id: CUSTOMER, created: true }, error: null });

    await createWalkInCustomer('98765 43210', 'Trade Co', 'Pune', 'merchant');
    expect(invoke).toHaveBeenCalledWith('create-walkin-customer', {
      headers: { Authorization: 'Bearer user-jwt' },
      body: {
        phone_number: '+919876543210',
        full_name: 'Trade Co',
        address: 'Pune',
        role: 'merchant',
      },
    });
  });

  test('normalizes the phone before sending, so the shop cannot create a duplicate', async () => {
    invoke.mockResolvedValue({ data: { customer_id: CUSTOMER, created: false }, error: null });

    await createWalkInCustomer('+91 98765-43210', 'Asha Patil', '');
    expect(invoke.mock.calls[0][1].body.phone_number).toBe('+919876543210');
  });

  test('returns the existing id when the number is already registered', async () => {
    // created: false is the idempotent path — the function looked the number up
    // rather than minting a second account for the same person.
    invoke.mockResolvedValue({ data: { customer_id: CUSTOMER, created: false }, error: null });
    await expect(createWalkInCustomer('9876543210', 'Asha', '')).resolves.toBe(CUSTOMER);
  });

  test('surfaces a transport error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request' } });
    await expect(createWalkInCustomer('9876543210', 'Asha', '')).rejects.toThrow(
      'Failed to send a request',
    );
  });

  test('replaces opaque non-2xx invoke errors with a register failure', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code' },
    });
    await expect(createWalkInCustomer('9876543210', 'Asha', '')).rejects.toThrow(
      'Could not register the customer.',
    );
  });

  test("surfaces the function's own error body, such as the shop-users-only gate", async () => {
    invoke.mockResolvedValue({ data: { error: 'Forbidden: shop users only' }, error: null });
    await expect(createWalkInCustomer('9876543210', 'Asha', '')).rejects.toThrow(
      'Forbidden: shop users only',
    );
  });

  test('fails loudly rather than returning undefined when the response is empty', async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    await expect(createWalkInCustomer('9876543210', 'Asha', '')).rejects.toThrow(
      'Could not register the customer.',
    );
  });
});

describe('createLoanWithCustomer', () => {
  const shopDefaults: ShopDefaults = {
    id: 1,
    interest_model: 'retail',
    rate_bps: 300,
    merchant_rate_bps: 150,
    simple_period_days: 180,
    compound_every_days: 30,
    grace_days: 0,
    partial_period_mode: 'min_month_then_pro_rata',
    round_up_threshold_days: 24,
    loans_concealed: false,
    updated_at: '2024-01-01T00:00:00Z',
  };

  const form: LoanFormData = {
    serial_number: 'T-1',
    customer_name: 'Asha Patil',
    phone_number: '9876543210',
    address: 'Pune',
    loan_amount_rupees: '10000',
    interest_percent_monthly: '',
    disbursed_on: '2024-01-01',
  };

  const items: ScannerItemDraft[] = [
    {
      key: 'item-1',
      metal: 'gold',
      ornament_type: 'Gold chain',
      description: '',
      gross_grams: '10.5',
      stone_grams: '0',
      net_grams: '10.5',
      netManuallyEdited: false,
      purity_karat: null,
      quantity: '1',
      localPhotoUri: null,
    },
  ];

  const photoInserts: { loan_item_id: string; storage_path: string }[] = [];

  beforeEach(() => {
    photoInserts.length = 0;
    saveKycCaptureMock.mockReset();
    saveKycCaptureMock.mockResolvedValue(undefined);
    uploadKycImageMock.mockReset();
    uploadKycImageMock.mockResolvedValue(`${CUSTOMER}/id-doc.jpg`);
    uploadCustomerPhotoMock.mockReset();
    uploadCustomerPhotoMock.mockResolvedValue(`${CUSTOMER}/photo/face.jpg`);
    const { supabase } = jest.requireMock('@/lib/supabase') as {
      supabase: { from: jest.Mock };
    };
    supabase.from.mockImplementation((table: string) => {
      const result =
        table === 'shop_defaults'
          ? { data: shopDefaults, error: null }
          : { data: { id: CUSTOMER, role: 'retail_customer' }, error: null };
      const chain: {
        select: jest.Mock;
        update: jest.Mock;
        insert: jest.Mock;
        eq: jest.Mock;
        maybeSingle: jest.Mock;
        single: jest.Mock;
        then: (resolve: (value: typeof result) => unknown) => Promise<unknown>;
      } = {
        select: jest.fn(),
        update: jest.fn(),
        insert: jest.fn(async (row: { loan_item_id: string; storage_path: string }) => {
          if (table === 'loan_item_photos') {
            photoInserts.push(row);
          }
          return { error: null };
        }),
        eq: jest.fn(),
        maybeSingle: jest.fn(async () => result),
        single: jest.fn(async () => result),
        then: (resolve) => Promise.resolve(result).then(resolve),
      };
      chain.select.mockReturnValue(chain);
      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      return chain;
    });
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'find_profile_by_phone') {
        return { data: CUSTOMER, error: null };
      }
      return { data: [{ loan_id: 'loan-uuid', item_ids: ['item-a'] }], error: null };
    });
  });

  test('creates the loan and items in one RPC after converting grams to milligrams', async () => {
    await expect(createLoanWithCustomer(form, items, 'file:///tmp/a.jpg', null)).resolves.toEqual({
      loanId: 'loan-uuid',
      customerId: CUSTOMER,
      kycSaveFailed: false,
    });

    expect(rpc).toHaveBeenCalledWith('create_loan', {
      p_customer_id: CUSTOMER,
      p_serial_number: 'T-1',
      p_receipt_image_url: expect.stringMatching(
        new RegExp(`^${CUSTOMER}/receipts/\\d+-[a-z0-9]+\\.jpg$`),
      ),
      p_principal_paise: 1000000,
      p_rate_bps: 300,
      p_disbursed_on: '2024-01-01',
      p_interest_model: 'retail',
      p_digital_signature_url: null,
      p_items: [
        {
          metal: 'gold',
          ornament_type: 'Gold chain',
          description: null,
          gross_weight_mg: 10500,
          net_weight_mg: 10500,
          stone_deduction_mg: 0,
          purity_karat: null,
          quantity: 1,
        },
      ],
    });
  });

  test('uses merchant interest model and default rate when counter type is merchant', async () => {
    await createLoanWithCustomer(form, items, 'file:///tmp/a.jpg', null, null, 'merchant');

    expect(rpc).toHaveBeenCalledWith(
      'create_loan',
      expect.objectContaining({
        p_interest_model: 'merchant',
        p_rate_bps: 150,
      }),
    );
  });

  test('rejects a missing metal before calling create_loan', async () => {
    await expect(
      createLoanWithCustomer(
        form,
        [{ ...items[0]!, metal: null }],
        'file:///tmp/a.jpg',
        null,
      ),
    ).rejects.toThrow('Choose gold or silver for every pledged item.');
    expect(rpc).not.toHaveBeenCalledWith('create_loan', expect.anything());
  });

  test('surfaces the RPC error rather than leaving a loan without items', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'find_profile_by_phone') {
        return { data: CUSTOMER, error: null };
      }
      return {
        data: null,
        error: { message: 'items_required: create_loan needs at least one pledged item' },
      };
    });
    await expect(createLoanWithCustomer(form, items, 'file:///tmp/a.jpg', null)).rejects.toThrow(
      'items_required: create_loan needs at least one pledged item',
    );
  });

  test('maps serial_exists: to SerialExistsError with the serial', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'find_profile_by_phone') {
        return { data: CUSTOMER, error: null };
      }
      return {
        data: null,
        error: { message: 'serial_exists: T-1' },
      };
    });
    await expect(createLoanWithCustomer(form, items, 'file:///tmp/a.jpg', null)).rejects.toEqual(
      expect.objectContaining({
        name: 'SerialExistsError',
        serialNumber: 'T-1',
        code: 'SERIAL_EXISTS',
      }),
    );
  });

  test('attaches photo N to item N using ids returned by create_loan', async () => {
    const itemIds = ['item-a', 'item-b', 'item-c'];
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'find_profile_by_phone') {
        return { data: CUSTOMER, error: null };
      }
      return { data: [{ loan_id: 'loan-uuid', item_ids: itemIds }], error: null };
    });
    const photographed: ScannerItemDraft[] = [
      { ...items[0]!, key: 'i1', ornament_type: 'Chain', localPhotoUri: 'file:///tmp/chain.jpg' },
      { ...items[0]!, key: 'i2', ornament_type: 'Bangle', localPhotoUri: 'file:///tmp/bangle.jpg' },
      { ...items[0]!, key: 'i3', ornament_type: 'Ring', localPhotoUri: 'file:///tmp/ring.jpg' },
    ];

    await expect(
      createLoanWithCustomer(form, photographed, 'file:///tmp/receipt.jpg', null),
    ).resolves.toEqual({
      loanId: 'loan-uuid',
      customerId: CUSTOMER,
      kycSaveFailed: false,
    });

    expect(photoInserts.map((row) => row.loan_item_id)).toEqual(itemIds);
    expect(photoInserts.every((row) => row.storage_path.startsWith(`${CUSTOMER}/items/`))).toBe(
      true,
    );
  });

  test('a mid-loop upload failure reports that the loan exists, not a generic save failure', async () => {
    const itemIds = ['item-a', 'item-b', 'item-c'];
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'find_profile_by_phone') {
        return { data: CUSTOMER, error: null };
      }
      return { data: [{ loan_id: 'loan-uuid', item_ids: itemIds }], error: null };
    });
    let uploadCount = 0;
    upload.mockImplementation(async () => {
      uploadCount += 1;
      // 1 = receipt (before RPC), 2 = item 1, 3 = item 2 (fails)
      if (uploadCount === 3) {
        return { error: { message: 'storage full' } };
      }
      return { error: null };
    });
    const photographed: ScannerItemDraft[] = [
      { ...items[0]!, key: 'i1', ornament_type: 'Chain', localPhotoUri: 'file:///tmp/chain.jpg' },
      { ...items[0]!, key: 'i2', ornament_type: 'Bangle', localPhotoUri: 'file:///tmp/bangle.jpg' },
      { ...items[0]!, key: 'i3', ornament_type: 'Ring', localPhotoUri: 'file:///tmp/ring.jpg' },
    ];

    const thrown = await createLoanWithCustomer(
      form,
      photographed,
      'file:///tmp/receipt.jpg',
      null,
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(LoanPhotosIncompleteError);
    const incomplete = thrown as LoanPhotosIncompleteError;
    expect(incomplete.code).toBe('LOAN_PHOTOS_INCOMPLETE');
    expect(incomplete.loanId).toBe('loan-uuid');
    expect(incomplete.serialNumber).toBe('T-1');
    expect(incomplete.nextIndex).toBe(1);
    expect(incomplete.message).toMatch(/Loan T-1 was created/);
    expect(incomplete.message).toMatch(/retry attaching photos/);
    expect(rpc).toHaveBeenCalledWith('create_loan', expect.objectContaining({ p_serial_number: 'T-1' }));
    expect(photoInserts).toHaveLength(1);
    expect(photoInserts[0]?.loan_item_id).toBe('item-a');
  });

  test('persists KYC after the customer id is known and still creates the loan', async () => {
    const outcome = await createLoanWithCustomer(form, items, 'file:///tmp/a.jpg', null, {
      idDocumentType: 'pan',
      idDocumentLast4: '1234',
      dateOfBirth: '1990-01-15',
      guardianName: 'Parent',
      localPhotoUri: 'file:///tmp/pan.jpg',
      localCustomerPhotoUri: 'file:///tmp/face.jpg',
    });

    expect(outcome).toEqual({
      loanId: 'loan-uuid',
      customerId: CUSTOMER,
      kycSaveFailed: false,
    });
    expect(uploadKycImageMock).toHaveBeenCalledWith('file:///tmp/pan.jpg', CUSTOMER, 'pan');
    expect(uploadCustomerPhotoMock).toHaveBeenCalledWith('file:///tmp/face.jpg', CUSTOMER);
    expect(saveKycCaptureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: CUSTOMER,
        idDocumentType: 'pan',
        idDocumentLast4: '1234',
        photoPath: `${CUSTOMER}/photo/face.jpg`,
      }),
    );
  });

  test('still creates the loan when KYC persistence fails', async () => {
    saveKycCaptureMock.mockRejectedValueOnce(new Error('RLS denied'));

    const outcome = await createLoanWithCustomer(form, items, 'file:///tmp/a.jpg', null, {
      idDocumentType: 'aadhaar',
      idDocumentLast4: '5678',
      dateOfBirth: '',
      guardianName: '',
      localPhotoUri: null,
      localCustomerPhotoUri: null,
    });

    expect(outcome).toEqual({
      loanId: 'loan-uuid',
      customerId: CUSTOMER,
      kycSaveFailed: true,
    });
    expect(rpc).toHaveBeenCalledWith('create_loan', expect.anything());
  });

  test('skips KYC writes when the draft is empty', async () => {
    await createLoanWithCustomer(form, items, 'file:///tmp/a.jpg', null, {
      idDocumentType: null,
      idDocumentLast4: '',
      dateOfBirth: '',
      guardianName: '',
      localPhotoUri: null,
      localCustomerPhotoUri: null,
    });

    expect(saveKycCaptureMock).not.toHaveBeenCalled();
    expect(uploadKycImageMock).not.toHaveBeenCalled();
  });
});

describe('redeemLoan', () => {
  test('calls the RPC and returns the audit snapshot', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          loan_id: 'loan-1',
          status: 'redeemed',
          redeemed_on: '2024-01-31',
          redeemed_by: CUSTOMER,
          closure_balance_paise: 1030000,
          already_redeemed: false,
        },
      ],
      error: null,
    });

    await expect(
      redeemLoan({
        loanId: 'loan-1',
        redeemedOn: '2024-01-31',
        releasedToName: 'Asha Patil',
        itemIds: ['item-1', 'item-2'],
        finalPaymentPaise: 1030000,
      }),
    ).resolves.toMatchObject({
      closure_balance_paise: 1030000,
      already_redeemed: false,
    });

    expect(rpc).toHaveBeenCalledWith('redeem_loan', {
      p_loan_id: 'loan-1',
      p_redeemed_on: '2024-01-31',
      p_released_to_name: 'Asha Patil',
      p_item_ids: ['item-1', 'item-2'],
      p_final_payment_paise: 1030000,
      p_release_note: null,
      p_release_signature_url: null,
    });
  });

  test('surfaces owner_only so the screen can show a calm message', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'owner_only: only the owner may redeem a loan' },
    });
    await expect(
      redeemLoan({
        loanId: 'loan-1',
        redeemedOn: '2024-01-31',
        releasedToName: 'Asha',
        itemIds: [],
        finalPaymentPaise: 0,
      }),
    ).rejects.toThrow('owner_only: only the owner may redeem a loan');
  });
});

describe('findCustomerIdByPhone', () => {
  test('calls find_profile_by_phone with the typed number so SQL normalises', async () => {
    rpc.mockResolvedValue({ data: 'cust-1', error: null });
    await expect(findCustomerIdByPhone('98765 43210')).resolves.toBe('cust-1');
    expect(rpc).toHaveBeenCalledWith('find_profile_by_phone', { p_phone: '98765 43210' });
  });

  test('returns null when no profile matches', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(findCustomerIdByPhone('9876543210')).resolves.toBeNull();
  });
});

describe('defaultLoan', () => {
  test('calls the RPC and returns the audit snapshot', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          loan_id: 'loan-1',
          status: 'defaulted',
          defaulted_on: '2024-07-01',
          defaulted_by: CUSTOMER,
          default_balance_paise: 1180000,
          already_defaulted: false,
        },
      ],
      error: null,
    });

    await expect(
      defaultLoan({
        loanId: 'loan-1',
        defaultedOn: '2024-07-01',
        reason: 'Unreachable after six months',
      }),
    ).resolves.toMatchObject({
      default_balance_paise: 1180000,
      already_defaulted: false,
    });

    expect(rpc).toHaveBeenCalledWith('default_loan', {
      p_loan_id: 'loan-1',
      p_defaulted_on: '2024-07-01',
      p_reason: 'Unreachable after six months',
    });
  });

  test('surfaces owner_only so the screen can show a calm message', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'owner_only: only the owner may default a loan' },
    });
    await expect(
      defaultLoan({
        loanId: 'loan-1',
        defaultedOn: '2024-07-01',
        reason: 'x',
      }),
    ).rejects.toThrow('owner_only: only the owner may default a loan');
  });
});

describe('archiveLoan', () => {
  test('calls the RPC and returns the frozen snapshot', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          loan_id: 'loan-1',
          archived_at: '2026-08-15T06:30:00+00:00',
          archived_by: CUSTOMER,
          archive_reason: 'Duplicate ticket',
          archive_balance_paise: 1180000,
          already_archived: false,
        },
      ],
      error: null,
    });

    await expect(
      archiveLoan({ loanId: 'loan-1', reason: 'Duplicate ticket' }),
    ).resolves.toMatchObject({
      archive_balance_paise: 1180000,
      already_archived: false,
    });

    expect(rpc).toHaveBeenCalledWith('archive_loan', {
      p_loan_id: 'loan-1',
      p_reason: 'Duplicate ticket',
    });
  });

  test('surfaces owner_only so the screen can show a calm message', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'owner_only: only the owner may archive a loan' },
    });
    await expect(archiveLoan({ loanId: 'loan-1', reason: 'x' })).rejects.toThrow(
      'owner_only: only the owner may archive a loan',
    );
  });
});

describe('unarchiveLoan', () => {
  test('calls the RPC', async () => {
    rpc.mockResolvedValue({
      data: [{ loan_id: 'loan-1', unarchived: true }],
      error: null,
    });
    await expect(unarchiveLoan('loan-1')).resolves.toEqual({
      loan_id: 'loan-1',
      unarchived: true,
    });
    expect(rpc).toHaveBeenCalledWith('unarchive_loan', { p_loan_id: 'loan-1' });
  });
});

describe('unredeemLoan', () => {
  test('calls the RPC with a reason', async () => {
    rpc.mockResolvedValue({
      data: [{ loan_id: 'loan-1', status: 'active', reversed_payment_id: 'pay-1' }],
      error: null,
    });
    await expect(
      unredeemLoan({ loanId: 'loan-1', reason: 'Wrong ticket' }),
    ).resolves.toEqual({
      loan_id: 'loan-1',
      status: 'active',
      reversed_payment_id: 'pay-1',
    });
    expect(rpc).toHaveBeenCalledWith('unredeem_loan', {
      p_loan_id: 'loan-1',
      p_reason: 'Wrong ticket',
    });
  });
});

describe('fetchArchivedLoans', () => {
  test('lists archived rows; nested names and integer paise', async () => {
    const { supabase } = jest.requireMock('@/lib/supabase') as {
      supabase: { from: jest.Mock };
    };
    const result = {
      data: [
        {
          id: 'loan-1',
          serial_number: 'G-1',
          archived_at: '2026-08-15T06:30:00+00:00',
          archived_by: CUSTOMER,
          archive_reason: 'Duplicate ticket',
          archive_balance_paise: 1180000,
          customer: { full_name: 'Asha Patil' },
          archiver: { full_name: 'Owner' },
        },
      ],
      error: null,
    };
    const chain = {
      select: jest.fn(),
      not: jest.fn(),
      order: jest.fn(),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    chain.select.mockReturnValue(chain);
    chain.not.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    supabase.from.mockReturnValue(chain);

    await expect(fetchArchivedLoans()).resolves.toEqual([
      {
        id: 'loan-1',
        serial_number: 'G-1',
        archived_at: '2026-08-15T06:30:00+00:00',
        archived_by: CUSTOMER,
        archive_reason: 'Duplicate ticket',
        archive_balance_paise: 1180000,
        customer_name: 'Asha Patil',
        archived_by_name: 'Owner',
      },
    ]);
    expect(supabase.from).toHaveBeenCalledWith('loans');
    expect(chain.not).toHaveBeenCalledWith('archived_at', 'is', null);
  });
});

describe('updateShopDefaults', () => {
  test('calls the RPC without a client-side id = 1 filter', async () => {
    rpc.mockResolvedValue({
      data: {
        id: 1,
        rate_bps: 400,
        partial_period_mode: 'pro_rata',
        round_up_threshold_days: 20,
        simple_period_days: 180,
        compound_every_days: 30,
        grace_days: 0,
      },
      error: null,
    });
    await expect(
      updateShopDefaults({
        rateBps: 400,
        partialPeriodMode: 'pro_rata',
        roundUpThresholdDays: 20,
        simplePeriodDays: 180,
        compoundEveryDays: 30,
        graceDays: 0,
      }),
    ).resolves.toMatchObject({ rate_bps: 400 });
    expect(rpc).toHaveBeenCalledWith('update_shop_defaults', {
      p_rate_bps: 400,
      p_partial_period_mode: 'pro_rata',
      p_round_up_threshold_days: 20,
      p_simple_period_days: 180,
      p_compound_every_days: 30,
      p_grace_days: 0,
    });
  });
});

describe('loans concealment RPCs', () => {
  test('fetchLoansConcealed reads the DEFINER flag', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(fetchLoansConcealed()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('loans_are_concealed');
  });

  test('setLoansConcealed calls the owner-only RPC', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(setLoansConcealed(true)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('set_loans_concealed', { p_concealed: true });
  });
});

describe('editLoanTerms', () => {
  test('calls the RPC with parsed terms and a reason', async () => {
    rpc.mockResolvedValue({
      data: [{ loan_id: 'loan-1', change_count: 1 }],
      error: null,
    });
    await expect(
      editLoanTerms({
        loanId: 'loan-1',
        rateBps: 400,
        interestModel: 'retail',
        simplePeriodDays: 180,
        compoundEveryDays: 30,
        graceDays: 0,
        partialPeriodMode: 'min_month_then_pro_rata',
        roundUpThresholdDays: 24,
        reason: 'Customer asked for 4 percent',
      }),
    ).resolves.toEqual({ loan_id: 'loan-1', change_count: 1 });
  });
});

describe('renewLoan', () => {
  test('calls the RPC with the accrued interest, not a client-computed figure', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          renewal_id: 'ren-1',
          loan_id: 'loan-1',
          renewed_on: '2024-07-01',
          interest_paid_paise: 91000,
          new_maturity_on: '2024-12-28',
          already_renewed: false,
        },
      ],
      error: null,
    });

    await expect(
      renewLoan({
        loanId: 'loan-1',
        renewedOn: '2024-07-01',
        interestPaidPaise: 91000,
        newMaturityOn: '2024-12-28',
      }),
    ).resolves.toMatchObject({ interest_paid_paise: 91000, already_renewed: false });

    expect(rpc).toHaveBeenCalledWith('renew_loan', {
      p_loan_id: 'loan-1',
      p_renewed_on: '2024-07-01',
      p_interest_paid_paise: 91000,
      p_new_maturity_on: '2024-12-28',
      p_note: null,
    });
  });
});

describe('fetchOverdueLoans', () => {
  test('calls loans_overdue_as_of and coerces paise', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          loan_id: 'loan-1',
          customer_id: CUSTOMER,
          serial_number: 'T070-N1',
          disbursed_on: '2024-01-01',
          due_on: '2024-06-29',
          days_overdue: 1,
          outstanding_principal_paise: '1000000',
          accrued_interest_paise: '30000',
          total_due_paise: '1030000',
          customer_name: 'Asha Patil',
          phone_number: '+919876543210',
        },
      ],
      error: null,
    });

    await expect(fetchOverdueLoans('2024-06-30')).resolves.toEqual([
      expect.objectContaining({
        serial_number: 'T070-N1',
        total_due_paise: 1030000,
        phone_number: '+919876543210',
      }),
    ]);
    expect(rpc).toHaveBeenCalledWith('loans_overdue_as_of', { p_as_of: '2024-06-30' });
  });
});

describe('fetchRateYield', () => {
  test('calls shop_rate_yield with no client-side rate brackets', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          rate_bps: 150,
          loan_count: 1,
          principal_paise: 2000000,
          one_period_yield_paise: 30000,
          six_period_yield_paise: 180000,
          twelve_period_yield_paise: 360000,
        },
      ],
      error: null,
    });

    await expect(fetchRateYield()).resolves.toEqual([
      expect.objectContaining({ rate_bps: 150, one_period_yield_paise: 30000 }),
    ]);
    expect(rpc).toHaveBeenCalledWith('shop_rate_yield');
  });
});

describe('generateLoanNotices', () => {
  test('returns the inserted count from SQL', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await expect(generateLoanNotices('2024-06-14')).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith('generate_loan_notices', { p_as_of: '2024-06-14' });
  });
});

describe('fetchCustomerLoanReminders', () => {
  test('calls the SQL schedule and drops unknown kinds', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          loan_id: 'loan-1',
          serial_number: 'T080-A',
          due_on: '2024-06-29',
          reminder_kind: 'due_soon',
          fire_at: '2024-06-14T03:30:00.000Z',
        },
        {
          loan_id: 'loan-1',
          serial_number: 'T080-A',
          due_on: '2024-06-29',
          reminder_kind: 'not-a-kind',
          fire_at: '2024-06-14T03:30:00.000Z',
        },
      ],
      error: null,
    });

    await expect(fetchCustomerLoanReminders('2024-06-01')).resolves.toEqual([
      expect.objectContaining({ reminder_kind: 'due_soon', serial_number: 'T080-A' }),
    ]);
    expect(rpc).toHaveBeenCalledWith('customer_loan_reminder_schedule', { p_as_of: '2024-06-01' });
  });

  test('always sends p_as_of so PostgREST does not look for a zero-arg overload', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchCustomerLoanReminders();
    expect(rpc).toHaveBeenCalledWith('customer_loan_reminder_schedule', {
      p_as_of: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });
});

describe('findLoanBySerial', () => {
  test('returns a typed row for an exact serial', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          loan_id: 'loan-1',
          serial_number: 'T-1',
          status: 'active',
          is_archived: false,
          customer_name: 'Asha Patil',
        },
      ],
      error: null,
    });
    await expect(findLoanBySerial(' T-1 ')).resolves.toEqual({
      loanId: 'loan-1',
      serialNumber: 'T-1',
      status: 'active',
      isArchived: false,
      customerName: 'Asha Patil',
    });
    expect(rpc).toHaveBeenCalledWith('find_loan_by_serial', { p_serial: 'T-1' });
  });

  test('returns null when the serial is empty', async () => {
    await expect(findLoanBySerial('   ')).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('fetchLoanBalances', () => {
  test('coerces PostgREST string paise columns', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          accrued_interest_paise: '150000',
          outstanding_principal_paise: '5000000',
          total_due_paise: '5150000',
          interest_paid_paise: '0',
          principal_paid_paise: '0',
          overpayment_refunded_paise: '0',
        },
      ],
      error: null,
    });
    await expect(fetchLoanBalances('loan-1', '2024-01-06')).resolves.toEqual({
      accruedInterestPaise: 150000,
      outstandingPrincipalPaise: 5000000,
      totalDuePaise: 5150000,
      interestPaidPaise: 0,
      principalPaidPaise: 0,
      overpaymentRefundedPaise: 0,
    });
    expect(rpc).toHaveBeenCalledWith('loan_balances_as_of', {
      p_loan_id: 'loan-1',
      p_as_of: '2024-01-06',
    });
  });
});

describe('logPayment', () => {
  test('inserts a positive paise payment', async () => {
    const insert = jest.fn(async () => ({ error: null }));
    const { supabase } = jest.requireMock('@/lib/supabase') as { supabase: { from: jest.Mock } };
    supabase.from.mockReturnValue({ insert });

    await logPayment('loan-1', 150000, '2024-01-08');
    expect(supabase.from).toHaveBeenCalledWith('payments');
    expect(insert).toHaveBeenCalledWith({
      loan_id: 'loan-1',
      amount_paid_paise: 150000,
      paid_on: '2024-01-08',
    });
  });

  test.each([0, -1] as const)('refuses non-positive amount %p', async (amount) => {
    await expect(logPayment('loan-1', amount)).rejects.toThrow(
      'Payment amount must be greater than zero paise.',
    );
  });
});


