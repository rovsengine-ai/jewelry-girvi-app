jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
    },
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('@/lib/prepare-receipt-image', () => ({
  prepareReceiptForOcr: jest.fn(async () => ({
    uri: 'file:///tmp/prepared.jpg',
    base64: 'abc',
    mimeType: 'image/jpeg',
  })),
  ReceiptImageTooLargeError: class ReceiptImageTooLargeError extends Error {
    constructor() {
      super('ReceiptImageTooLarge');
      this.name = 'ReceiptImageTooLargeError';
    }
  },
}));

import { supabase } from '@/lib/supabase';
import {
  extractReceiptData,
  OcrServiceError,
  ocrErrorDisplayMessage,
  ocrErrorMessageKey,
} from '@/services/ocrService';

const auth = (
  supabase as unknown as {
    auth: {
      getSession: jest.Mock;
      refreshSession: jest.Mock;
    };
  }
).auth;
const invoke = (
  supabase as unknown as { functions: { invoke: jest.Mock } }
).functions.invoke;

const t = (key: string) => key;

describe('ocrErrorMessageKey', () => {
  test('maps unavailable edge failures to a bilingual key', () => {
    expect(
      ocrErrorMessageKey(
        new OcrServiceError('unavailable', 'Edge Function returned a non-2xx status code'),
      ),
    ).toBe('loans.scanner.ocrUnavailable');
  });

  test('maps misconfigured Moonshot key', () => {
    expect(
      ocrErrorMessageKey(
        new OcrServiceError('misconfigured', 'MOONSHOT_API_KEY is not configured'),
      ),
    ).toBe('loans.scanner.ocrMisconfigured');
  });

  test('maps provider_rejected failures', () => {
    expect(
      ocrErrorMessageKey(
        new OcrServiceError(
          'provider_rejected',
          'OCR provider rejected the request (400): invalid model',
        ),
      ),
    ).toBe('loans.scanner.ocrProviderRejected');
  });

  test('maps image_too_large failures', () => {
    expect(
      ocrErrorMessageKey(new OcrServiceError('image_too_large', 'ReceiptImageTooLarge')),
    ).toBe('loans.scanner.ocrImageTooLarge');
  });

  test('maps unauthorized failures', () => {
    expect(
      ocrErrorMessageKey(new OcrServiceError('unauthorized', 'Unauthorized')),
    ).toBe('loans.scanner.ocrUnauthorized');
  });
});

describe('ocrErrorDisplayMessage', () => {
  test('maps Moonshot auth failures to misconfigured display copy', () => {
    expect(
      ocrErrorDisplayMessage(
        new OcrServiceError(
          'provider_rejected',
          'OCR provider rejected the request (401): Invalid Authentication',
        ),
        t,
      ),
    ).toBe('loans.scanner.ocrProviderRejected');
  });

  test('shows setup guidance for misconfigured errors', () => {
    expect(
      ocrErrorDisplayMessage(
        new OcrServiceError('misconfigured', 'MOONSHOT_API_KEY is not configured'),
        t,
      ),
    ).toBe('loans.scanner.ocrMisconfigured');
  });
});

describe('extractReceiptData auth', () => {
  beforeEach(() => {
    auth.getSession.mockReset();
    auth.refreshSession.mockReset();
    invoke.mockReset();
  });

  test('sends the user access token on the Edge Function invoke', async () => {
    auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'user-jwt',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    invoke.mockResolvedValue({
      data: {
        serial_number: '1',
        date: '',
        customer_name: '',
        phone_number: '',
        address: '',
        item_name: '',
        weight_grams: 0,
        loan_amount: 0,
        interest_rate: 0,
      },
      error: null,
    });

    await extractReceiptData('file:///tmp/receipt.jpg');

    expect(invoke).toHaveBeenCalledWith(
      'extract-receipt',
      expect.objectContaining({
        headers: { Authorization: 'Bearer user-jwt' },
      }),
    );
  });

  test('throws unauthorized when there is no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(extractReceiptData('file:///tmp/receipt.jpg')).rejects.toMatchObject({
      name: 'OcrServiceError',
      code: 'unauthorized',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  test('classifies Moonshot auth failures as misconfigured', async () => {
    auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'user-jwt',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    invoke.mockResolvedValue({
      data: {
        error: 'OCR provider rejected the request',
        code: 'provider_rejected',
        upstream_status: 401,
        upstream_detail: '{"error":{"message":"Invalid Authentication","type":"invalid_authentication_error"}}',
      },
      error: null,
    });

    await expect(extractReceiptData('file:///tmp/receipt.jpg')).rejects.toMatchObject({
      name: 'OcrServiceError',
      code: 'misconfigured',
    });
  });

  test('classifies misconfigured edge payloads by code', async () => {
    auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'user-jwt',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    invoke.mockResolvedValue({
      data: {
        error: 'MOONSHOT_API_KEY is not configured',
        code: 'misconfigured',
      },
      error: null,
    });

    await expect(extractReceiptData('file:///tmp/receipt.jpg')).rejects.toMatchObject({
      name: 'OcrServiceError',
      code: 'misconfigured',
    });
  });
});
