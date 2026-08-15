import { fireEvent, render, userEvent, waitFor } from '@testing-library/react-native';

import { KycCaptureForm } from '@/components/kyc-capture-form';
import { pickStillImage } from '@/lib/pick-image';
import { saveKycCapture, uploadKycImage, verifyKyc } from '@/services/kycService';
import type { CustomerKyc } from '@/services/kycService';

jest.mock('@/lib/pick-image', () => ({
  pickStillImage: jest.fn(),
}));

jest.mock('@/services/kycService', () => ({
  saveKycCapture: jest.fn(async () => undefined),
  uploadKycImage: jest.fn(async () => 'unused'),
  verifyKyc: jest.fn(async () => undefined),
}));

const pickStillImageMock = pickStillImage as jest.MockedFunction<typeof pickStillImage>;
const saveKycCaptureMock = saveKycCapture as jest.MockedFunction<typeof saveKycCapture>;
const uploadKycImageMock = uploadKycImage as jest.MockedFunction<typeof uploadKycImage>;
const verifyKycMock = verifyKyc as jest.MockedFunction<typeof verifyKyc>;

const CUSTOMER: CustomerKyc = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  full_name: 'Asha Patil',
  id_document_type: null,
  id_document_last4: null,
  id_document_path: null,
  date_of_birth: null,
  guardian_name: null,
  kyc_verified_on: null,
  kyc_verified_by: null,
};

const FULL_AADHAAR = '123456789012';

beforeEach(() => {
  jest.clearAllMocks();
  pickStillImageMock.mockResolvedValue('file:///tmp/id.jpg');
});

describe('<KycCaptureForm />', () => {
  test('Aadhaar lockout disables photo controls and shows the UIDAI reason', async () => {
    const user = userEvent.setup();
    const { getByTestId } = await render(<KycCaptureForm customer={CUSTOMER} />);
    await user.press(getByTestId('kyc-type-aadhaar'));

    await waitFor(() => {
      getByTestId('kyc-aadhaar-photo-reason');
    });
    expect(getByTestId('kyc-photo-camera').props.accessibilityState.disabled).toBe(true);
    expect(getByTestId('kyc-photo-library').props.accessibilityState.disabled).toBe(true);

    await user.press(getByTestId('kyc-photo-camera'));
    await user.press(getByTestId('kyc-photo-library'));
    expect(pickStillImageMock).not.toHaveBeenCalled();
  });

  test('rejects a 12-digit ID in the field instead of slicing it', async () => {
    const user = userEvent.setup();
    const { getByTestId } = await render(<KycCaptureForm customer={CUSTOMER} />);
    fireEvent.changeText(getByTestId('kyc-last4'), FULL_AADHAAR);

    await waitFor(() => {
      expect(getByTestId('kyc-last4').props.value).toBe('');
      getByTestId('kyc-last4-error');
    });

    await user.press(getByTestId('kyc-type-pan'));
    await user.press(getByTestId('kyc-save'));

    await waitFor(() => {
      expect(saveKycCaptureMock).toHaveBeenCalled();
    });
    expect(JSON.stringify(saveKycCaptureMock.mock.calls)).not.toContain(FULL_AADHAAR);
    expect(saveKycCaptureMock.mock.calls[0]?.[0].idDocumentLast4).toBe('');
  });

  test('Mark verified is a separate call and does not write capture fields', async () => {
    const user = userEvent.setup();
    const { getByTestId } = await render(<KycCaptureForm customer={CUSTOMER} />);
    await user.press(getByTestId('kyc-verify'));

    await waitFor(() => {
      expect(verifyKycMock).toHaveBeenCalledWith(CUSTOMER.id);
    });
    expect(saveKycCaptureMock).not.toHaveBeenCalled();
    expect(uploadKycImageMock).not.toHaveBeenCalled();
  });
});
