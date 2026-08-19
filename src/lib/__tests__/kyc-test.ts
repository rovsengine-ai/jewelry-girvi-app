import {
  acceptLast4Draft,
  assertKycPhotoAllowed,
  kycStatusLabel,
  normalizeIdLast4,
} from '@/lib/kyc';

describe('normalizeIdLast4', () => {
  test('accepts four alphanumeric characters', () => {
    expect(normalizeIdLast4('ab12')).toBe('AB12');
    expect(normalizeIdLast4(' 4321 ')).toBe('4321');
  });

  test.each(['', '123', '12345', '12-4', 'ABCD1', '123456789012'])('rejects %p', (input) => {
    expect(() => normalizeIdLast4(input)).toThrow(
      'Store only the last 4 characters of the ID, not the full number.',
    );
  });
});

describe('acceptLast4Draft', () => {
  test('keeps a 4-character draft', () => {
    expect(acceptLast4Draft('ab12')).toEqual({ ok: true, value: 'ab12' });
  });

  test('rejects a 12-digit number instead of slicing it', () => {
    expect(acceptLast4Draft('123456789012')).toEqual({
      ok: false,
      error: 'Store only the last 4 characters of the ID, not the full number.',
    });
  });

  test('empty draft is kept; five characters are refused, not sliced', () => {
    expect(acceptLast4Draft('')).toEqual({ ok: true, value: '' });
    expect(acceptLast4Draft('12345')).toEqual({
      ok: false,
      error: 'Store only the last 4 characters of the ID, not the full number.',
    });
  });
});

describe('assertKycPhotoAllowed', () => {
  test('Aadhaar photo lockout — matches profiles_no_aadhaar_image_chk', () => {
    expect(() =>
      assertKycPhotoAllowed('aadhaar', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/card.jpg'),
    ).toThrow('Aadhaar photos cannot be stored');
  });

  test('Aadhaar without a photo is allowed', () => {
    expect(() => assertKycPhotoAllowed('aadhaar', null)).not.toThrow();
  });

  test('PAN (and other non-Aadhaar types) may have a photo', () => {
    expect(() =>
      assertKycPhotoAllowed('pan', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/pan.jpg'),
    ).not.toThrow();
    expect(() =>
      assertKycPhotoAllowed('voter_id', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/voter.jpg'),
    ).not.toThrow();
    expect(() =>
      assertKycPhotoAllowed('passport', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/pp.jpg'),
    ).not.toThrow();
  });
});

describe('kycStatusLabel', () => {
  test('distinguishes verified from not', () => {
    expect(kycStatusLabel(null)).toBe('Not verified');
    expect(kycStatusLabel('2024-06-01')).toBe('Verified 2024-06-01');
    expect(kycStatusLabel(null, 'hi')).toBe('असत्यापित');
    expect(kycStatusLabel('2024-06-01', 'hi')).toBe('2024-06-01 को सत्यापित');
  });
});
