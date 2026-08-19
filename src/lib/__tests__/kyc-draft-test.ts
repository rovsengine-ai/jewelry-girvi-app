import { emptyKycDraft, kycDraftHasContent } from '@/lib/kyc-draft';

describe('emptyKycDraft', () => {
  test('starts with no document type, last-4, or photos', () => {
    expect(emptyKycDraft()).toEqual({
      idDocumentType: null,
      idDocumentLast4: '',
      dateOfBirth: '',
      guardianName: '',
      localPhotoUri: null,
      localCustomerPhotoUri: null,
    });
  });
});

describe('kycDraftHasContent', () => {
  test('empty and whitespace-only drafts are empty', () => {
    expect(kycDraftHasContent(emptyKycDraft())).toBe(false);
    expect(kycDraftHasContent({ ...emptyKycDraft(), guardianName: '  ' })).toBe(false);
  });

  test('last-4, face photo, or document type count as content', () => {
    expect(kycDraftHasContent({ ...emptyKycDraft(), idDocumentLast4: 'AB12' })).toBe(true);
    expect(
      kycDraftHasContent({ ...emptyKycDraft(), localCustomerPhotoUri: 'file://x' }),
    ).toBe(true);
    expect(kycDraftHasContent({ ...emptyKycDraft(), idDocumentType: 'pan' })).toBe(true);
  });
});
