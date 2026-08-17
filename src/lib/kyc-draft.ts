import type { IdDocumentType } from '@/types/database';

export type KycDraft = {
  idDocumentType: IdDocumentType | null;
  idDocumentLast4: string;
  dateOfBirth: string;
  guardianName: string;
  localPhotoUri: string | null;
  localCustomerPhotoUri: string | null;
};

export const emptyKycDraft = (): KycDraft => ({
  idDocumentType: null,
  idDocumentLast4: '',
  dateOfBirth: '',
  guardianName: '',
  localPhotoUri: null,
  localCustomerPhotoUri: null,
});

export function kycDraftHasContent(draft: KycDraft): boolean {
  return (
    draft.idDocumentType !== null ||
    draft.idDocumentLast4.trim() !== '' ||
    draft.dateOfBirth.trim() !== '' ||
    draft.guardianName.trim() !== '' ||
    draft.localPhotoUri !== null ||
    draft.localCustomerPhotoUri !== null
  );
}
