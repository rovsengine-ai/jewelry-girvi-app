import {
  saveKycCapture,
  uploadKycImage,
  verifyKyc,
} from '@/services/kycService';

jest.mock('@/lib/supabase', () => {
  const createSignedUrl = jest.fn();
  const upload = jest.fn();
  const fromTable = jest.fn();
  const getSession = jest.fn();
  return {
    __kycMocks: { createSignedUrl, upload, fromTable, getSession },
    supabase: {
      storage: { from: jest.fn(() => ({ createSignedUrl, upload })) },
      from: fromTable,
      auth: { getSession },
    },
  };
});

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(async () => ''),
}));

const { upload, fromTable, getSession } = (
  jest.requireMock('@/lib/supabase') as {
    __kycMocks: {
      createSignedUrl: jest.Mock;
      upload: jest.Mock;
      fromTable: jest.Mock;
      getSession: jest.Mock;
    };
  }
).__kycMocks;

const FileSystem = jest.requireMock('expo-file-system/legacy') as {
  readAsStringAsync: jest.Mock;
};

const CUSTOMER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const STAFF = 'a1b2c3d4-e5f6-4789-8abc-def012345678';
const FULL_AADHAAR = '123456789012';

function captureUpdates(): unknown[] {
  const payloads: unknown[] = [];
  fromTable.mockImplementation(() => {
    const chain: {
      update: (payload: unknown) => typeof chain;
      eq: () => Promise<{ error: null }>;
    } = {
      update: (payload: unknown) => {
        payloads.push(payload);
        return chain;
      },
      eq: async () => ({ error: null }),
    };
    return chain;
  });
  return payloads;
}

beforeEach(() => {
  jest.clearAllMocks();
  upload.mockResolvedValue({ error: null });
  FileSystem.readAsStringAsync.mockResolvedValue('');
  getSession.mockResolvedValue({
    data: { session: { user: { id: STAFF } } },
    error: null,
  });
});

describe('uploadKycImage', () => {
  test('refuses Aadhaar before reading the file or calling storage', async () => {
    await expect(
      uploadKycImage('file:///tmp/aadhaar.jpg', CUSTOMER, 'aadhaar'),
    ).rejects.toThrow('Aadhaar photos cannot be stored');
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  test('uploads PAN to the kyc bucket at {customer_id}/filename', async () => {
    const path = await uploadKycImage('file:///tmp/pan.jpg', CUSTOMER, 'pan');
    expect(path).toMatch(new RegExp(`^${CUSTOMER}/\\d+-[a-z0-9]+\\.jpg$`));
    expect(path).not.toMatch(/\/items\//);
    expect(upload).toHaveBeenCalled();
  });
});

describe('saveKycCapture', () => {
  test('writes capture columns and never verification fields', async () => {
    const payloads = captureUpdates();
    await saveKycCapture({
      customerId: CUSTOMER,
      idDocumentType: 'pan',
      idDocumentLast4: 'ab12',
      dateOfBirth: '1990-01-15',
      guardianName: 'Ramesh',
      idDocumentPath: `${CUSTOMER}/pan.jpg`,
    });
    expect(payloads).toEqual([
      {
        id_document_type: 'pan',
        id_document_last4: 'AB12',
        date_of_birth: '1990-01-15',
        guardian_name: 'Ramesh',
        id_document_path: `${CUSTOMER}/pan.jpg`,
      },
    ]);
    expect(JSON.stringify(payloads)).not.toMatch(/kyc_verified/);
  });

  test('rejects a 12-digit ID before any Supabase write', async () => {
    const payloads = captureUpdates();
    await expect(
      saveKycCapture({
        customerId: CUSTOMER,
        idDocumentType: 'aadhaar',
        idDocumentLast4: FULL_AADHAAR,
        dateOfBirth: '',
        guardianName: '',
        idDocumentPath: null,
      }),
    ).rejects.toThrow('Store only the last 4 characters of the ID, not the full number.');
    expect(payloads).toEqual([]);
    expect(fromTable).not.toHaveBeenCalled();
  });

  test('clears the document path when the type is Aadhaar', async () => {
    const payloads = captureUpdates();
    await saveKycCapture({
      customerId: CUSTOMER,
      idDocumentType: 'aadhaar',
      idDocumentLast4: '9012',
      dateOfBirth: '',
      guardianName: '',
      idDocumentPath: `${CUSTOMER}/should-not-keep.jpg`,
    });
    expect(payloads[0]).toMatchObject({
      id_document_type: 'aadhaar',
      id_document_last4: '9012',
      id_document_path: null,
    });
  });
});

describe('verifyKyc', () => {
  test('writes both verification fields and nothing else', async () => {
    const payloads = captureUpdates();
    await verifyKyc(CUSTOMER);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({
      kyc_verified_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      kyc_verified_by: STAFF,
    });
    expect(JSON.stringify(payloads[0])).not.toMatch(FULL_AADHAAR);
  });
});
