/**
 * Add girvi: Scan receipt (Kimi OCR) or enter manually. Owner and staff share
 * this route — RLS create_loan / is_shop_user is the boundary.
 *
 * Camera: https://docs.expo.dev/versions/v57.0.0/sdk/camera/
 * Image picker: https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { BlurTargetView } from 'expo-blur';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useReducer, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { FilterChip } from '@/components/filter-chip';
import { FormNotice } from '@/components/form-notice';
import { GlassSurface } from '@/components/glass-surface';
import { KycCaptureFields } from '@/components/kyc-capture-fields';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { Row } from '@/components/row';
import { ScreenHeader } from '@/components/screen-header';
import { SignaturePad, type SignaturePadRef } from '@/components/signature-pad';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Sizes, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { todayInKolkata } from '@/lib/money';
import { emptyKycDraft, kycDraftHasContent, type KycDraft } from '@/lib/kyc-draft';
import {
  inferMetalFromItemName,
  isOcrExtractionPartial,
} from '@/lib/ocr-receipt-parse';
import { pickStillImage } from '@/lib/pick-image';
import {
  emptyScannerItem,
  scannerItemsReducer,
  type PledgeMetal,
  type ScannerItemDraft,
} from '@/lib/scanner-items';
import { ADMIN_LOANS_HREF } from '@/lib/shop-tab-access';
import { gramsInputToMg } from '@/lib/weight';
import { useLanguage } from '@/providers/language-provider';
import {
  attachItemPhotos,
  createLoanWithCustomer,
  LoanPhotosIncompleteError,
} from '@/services/loanService';
import { extractReceiptData, ocrErrorDisplayMessage } from '@/services/ocrService';
import { PermissionDeniedError } from '@/lib/pick-image';
import type { LoanFormData, OcrExtractionResult } from '@/types/database';

const GOLD_PURITY_OPTIONS: Array<{ labelKey: string; value: number | null }> = [
  { labelKey: 'items.purity.notAssessed', value: null },
  { labelKey: 'items.purity.k24', value: 24 },
  { labelKey: 'items.purity.k22', value: 22 },
  { labelKey: 'items.purity.k18', value: 18 },
  { labelKey: 'items.purity.k14', value: 14 },
  { labelKey: 'items.purity.k10', value: 10 },
];

const emptyForm: LoanFormData = {
  serial_number: '',
  customer_name: '',
  phone_number: '',
  address: '',
  loan_amount_rupees: '',
  interest_percent_monthly: '3',
  disbursed_on: todayInKolkata(),
};

type EntryMode = 'scan' | 'manual';
type ScannerStep = 'choose' | 'camera' | 'review';

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return <FilterChip label={label} selected={selected} onPress={onPress} />;
}

function PledgeItemCard({
  item,
  index,
  canRemove,
  onPatch,
  onRemove,
}: {
  item: ScannerItemDraft;
  index: number;
  canRemove: boolean;
  onPatch: (patch: Partial<Omit<ScannerItemDraft, 'key'>>) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card>
      <Row>
        <ThemedText type="smallBold">{t('items.rowTitle', { index: index + 1 })}</ThemedText>
        {canRemove ? <Button label={t('common.remove')} variant="secondary" onPress={onRemove} /> : null}
      </Row>

      <ThemedText type="small">{t('items.metalRequired')}</ThemedText>
      <View style={styles.chipRow}>
        {(['gold', 'silver'] as const).map((metal: PledgeMetal) => (
          <ChoiceChip
            key={metal}
            label={metal === 'gold' ? t('items.gold') : t('items.silver')}
            selected={item.metal === metal}
            onPress={() => onPatch({ metal })}
          />
        ))}
      </View>

      <Field
        label={t('items.ornamentType')}
        value={item.ornament_type}
        onChangeText={(ornament_type) => onPatch({ ornament_type })}
      />
      <Field
        label={t('items.description')}
        value={item.description}
        onChangeText={(description) => onPatch({ description })}
      />
      <Field
        label={t('items.grossWeight')}
        value={item.gross_grams}
        onChangeText={(gross_grams) => onPatch({ gross_grams })}
        keyboardType="numeric"
      />
      <Field
        label={t('items.stoneDeduction')}
        value={item.stone_grams}
        onChangeText={(stone_grams) => onPatch({ stone_grams })}
        keyboardType="numeric"
      />
      <Field
        label={t('items.netWeight')}
        value={item.net_grams}
        onChangeText={(net_grams) => onPatch({ net_grams })}
        keyboardType="numeric"
        error={
          (() => {
            try {
              return gramsInputToMg(item.net_grams) > gramsInputToMg(item.gross_grams)
                ? t('items.netExceedsGross')
                : null;
            } catch {
              return null;
            }
          })()
        }
      />
      <Field
        label={t('items.quantity')}
        value={item.quantity}
        onChangeText={(quantity) => onPatch({ quantity })}
        keyboardType="numeric"
      />

      {item.metal === 'gold' ? (
        <>
          <ThemedText type="small">{t('items.purityOptionalHint')}</ThemedText>
          <View style={styles.chipRow}>
            {GOLD_PURITY_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.labelKey}
                label={t(option.labelKey)}
                selected={item.purity_karat === option.value}
                onPress={() => onPatch({ purity_karat: option.value })}
              />
            ))}
          </View>
        </>
      ) : item.metal === 'silver' ? (
        <ThemedText type="small">{t('items.silverWeightOnly')}</ThemedText>
      ) : (
        <ThemedText type="small">{t('items.chooseMetalFirst')}</ThemedText>
      )}
    </Card>
  );
}

export default function AdminScannerScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const colors = useTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const cameraBlurTargetRef = useRef<View>(null);
  const reviewScrollRef = useRef<ScrollView>(null);
  const signaturePadRef = useRef<SignaturePadRef>(null);
  const [reviewScrollEnabled, setReviewScrollEnabled] = useState(true);

  const [step, setStep] = useState<ScannerStep>('choose');
  const [entryMode, setEntryMode] = useState<EntryMode>('scan');
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [form, setForm] = useState<LoanFormData>(emptyForm);
  const [items, dispatchItems] = useReducer(scannerItemsReducer, [emptyScannerItem('item-1')]);
  const [isBusy, setIsBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [ocrPartial, setOcrPartial] = useState(false);
  const [savedLoanId, setSavedLoanId] = useState<string | null>(null);
  const [kycPendingCustomerId, setKycPendingCustomerId] = useState<string | null>(null);
  const [kycDraft, setKycDraft] = useState<KycDraft>(() => emptyKycDraft());
  const [photoGap, setPhotoGap] = useState<LoanPhotosIncompleteError | null>(null);
  // CameraView.isAvailableAsync is web-only; use Device.isDevice for simulators.
  // https://docs.expo.dev/versions/v57.0.0/sdk/device/
  const cameraAvailable = Device.isDevice;
  const [cameraMountError, setCameraMountError] = useState<string | null>(null);

  const updateForm = useCallback((key: keyof LoanFormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetDraft = useCallback(() => {
    setForm({ ...emptyForm, disbursed_on: todayInKolkata() });
    dispatchItems({ type: 'reset' });
    setLocalPhotoUri(null);
    setOcrPartial(false);
    setFormError(null);
    setFormNotice(null);
    setSavedLoanId(null);
    setKycPendingCustomerId(null);
    setKycDraft(emptyKycDraft());
    setPhotoGap(null);
    setCameraMountError(null);
  }, []);

  const applyOcrToForm = (uri: string, extracted: OcrExtractionResult) => {
    setLocalPhotoUri(uri);
    setForm({
      serial_number: extracted.serial_number,
      customer_name: extracted.customer_name,
      phone_number: extracted.phone_number,
      address: extracted.address,
      loan_amount_rupees: extracted.loan_amount ? String(extracted.loan_amount) : '',
      interest_percent_monthly: extracted.interest_rate
        ? String(extracted.interest_rate)
        : '3',
      disbursed_on: extracted.date || todayInKolkata(),
    });
    dispatchItems({
      type: 'seedFromOcr',
      ornamentType: extracted.item_name,
      grossGrams: extracted.weight_grams ? String(extracted.weight_grams) : '',
      metal: inferMetalFromItemName(extracted.item_name),
    });
    setOcrPartial(isOcrExtractionPartial(extracted));
    setStep('review');
  };

  const resolveOcrError = (error: unknown) => ocrErrorDisplayMessage(error, t);

  const processReceiptUri = async (uri: string) => {
    setIsBusy(true);
    setFormError(null);
    setFormNotice(t('loans.scanner.ocrWorking'));
    try {
      const { extraction, preparedUri } = await extractReceiptData(uri);
      setFormNotice(null);
      applyOcrToForm(preparedUri, extraction);
    } catch (error) {
      setFormNotice(null);
      setFormError(resolveOcrError(error));
    } finally {
      setIsBusy(false);
    }
  };

  const captureAndProcess = async () => {
    if (!cameraRef.current) return;

    setIsBusy(true);
    setFormError(null);
    setFormNotice(t('loans.scanner.ocrWorking'));
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) {
        throw new Error(t('loans.scanner.cameraNoImage'));
      }
      const { extraction, preparedUri } = await extractReceiptData(photo.uri);
      setFormNotice(null);
      applyOcrToForm(preparedUri, extraction);
    } catch (error) {
      setFormNotice(null);
      setFormError(resolveOcrError(error));
    } finally {
      setIsBusy(false);
    }
  };

  const pickGalleryAndProcess = async () => {
    setFormError(null);
    try {
      const uri = await pickStillImage('library');
      if (!uri) return;
      await processReceiptUri(uri);
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        setFormError(
          error.kind === 'library'
            ? t('loans.scanner.galleryPermission')
            : t('loans.scanner.cameraNeededBody'),
        );
        return;
      }
      setFormError(resolveOcrError(error));
    }
  };

  const startManual = () => {
    resetDraft();
    setEntryMode('manual');
    setStep('review');
  };

  const startScan = () => {
    resetDraft();
    setEntryMode('scan');
    setCameraMountError(null);
    setStep('camera');
  };

  const attachReceiptOnReview = async () => {
    setFormError(null);
    try {
      const uri = await pickStillImage('library');
      if (!uri) return;
      setLocalPhotoUri(uri);
    } catch (error) {
      if (error instanceof PermissionDeniedError && error.kind === 'library') {
        setFormError(t('loans.scanner.galleryPermission'));
        return;
      }
      setFormError(error instanceof Error ? error.message : t('loans.scanner.galleryPermission'));
    }
  };

  const retryPhotos = async (error: LoanPhotosIncompleteError) => {
    setIsBusy(true);
    setFormError(null);
    try {
      await attachItemPhotos({
        loanId: error.loanId,
        serialNumber: error.serialNumber,
        customerId: error.customerId,
        items,
        itemIds: error.itemIds,
        fromIndex: error.nextIndex,
      });
      setPhotoGap(null);
      setSavedLoanId(error.loanId);
      setFormNotice(t('loans.scanner.photosAttached'));
    } catch (retryError) {
      if (retryError instanceof LoanPhotosIncompleteError) {
        setPhotoGap(retryError);
        setSavedLoanId(retryError.loanId);
        setFormError(retryError.message);
      } else {
        setFormError(retryError instanceof Error ? retryError.message : t('errors.unknown'));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
    if (entryMode === 'scan' && !localPhotoUri) {
      setFormError(t('loans.scanner.captureBeforeSave'));
      return;
    }

    setIsBusy(true);
    setFormError(null);
    setFormNotice(null);
    setKycPendingCustomerId(null);
    try {
      const signatureDataUrl = (await signaturePadRef.current?.readSignature()) ?? null;
      const kycInput = kycDraftHasContent(kycDraft) ? kycDraft : null;
      const outcome = await createLoanWithCustomer(
        form,
        items,
        localPhotoUri,
        signatureDataUrl,
        kycInput,
      );
      setSavedLoanId(outcome.loanId);
      setPhotoGap(null);
      if (outcome.kycSaveFailed) {
        setKycPendingCustomerId(outcome.customerId);
        setFormNotice(t('loans.scanner.kycSaveFailed'));
      } else {
        setFormNotice(t('loans.scanner.createdSuccess'));
      }
    } catch (error) {
      if (error instanceof LoanPhotosIncompleteError) {
        setPhotoGap(error);
        setSavedLoanId(error.loanId);
        setFormError(error.message);
        return;
      }
      setFormError(error instanceof Error ? error.message : t('errors.unknown'));
    } finally {
      setIsBusy(false);
    }
  };

  const goBackFromReview = () => {
    if (entryMode === 'scan') {
      setStep('camera');
      setOcrPartial(false);
      setFormError(null);
      return;
    }
    setStep('choose');
  };

  if (step === 'choose') {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ScreenHeader showBack title={t('loans.scanner.choiceTitle')} />
        <View style={styles.choiceBody}>
          <GlassSurface androidBlur intensity="strong" style={styles.choiceGlass}>
            <ThemedText type="bodyLarge">{t('loans.scanner.choiceSubtitle')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('loans.scanner.bilingualHint')}
            </ThemedText>
            <Button
              testID="scanner-choose-scan"
              label={t('loans.scanner.scanReceipt')}
              onPress={startScan}
            />
            <Button
              testID="scanner-choose-manual"
              label={t('loans.scanner.enterManually')}
              variant="secondary"
              onPress={startManual}
            />
            <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
          </GlassSurface>
        </View>
      </ThemedView>
    );
  }

  if (step === 'camera') {
    if (!permission) {
      return (
        <ThemedView style={styles.container} type="surfaceSunken">
          <ScreenHeader showBack title={t('loans.scanner.cameraTitle')} />
          <ListSkeleton rows={4} />
        </ThemedView>
      );
    }

    if (!permission.granted) {
      return (
        <ThemedView style={styles.container} type="surfaceSunken">
          <ScreenHeader
            showBack
            title={t('loans.scanner.cameraTitle')}
            onBack={() => setStep('choose')}
          />
          <View style={styles.centered}>
            <GlassSurface androidBlur intensity="strong" style={styles.choiceGlass}>
              <EmptyState
                title={t('loans.scanner.cameraNeededTitle')}
                body={t('loans.scanner.cameraNeededBody')}
                actionLabel={t('common.grantPermission')}
                onAction={() => void requestPermission()}
              />
              <Button
                label={t('loans.scanner.pickFromGallery')}
                loading={isBusy}
                onPress={() => void pickGalleryAndProcess()}
              />
              <Button label={t('common.back')} variant="secondary" onPress={() => setStep('choose')} />
            </GlassSurface>
          </View>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={styles.container}>
        <ScreenHeader
          showBack
          title={t('loans.scanner.cameraTitle')}
          onBack={() => setStep('choose')}
        />
        <View style={styles.cameraStage}>
          <BlurTargetView ref={cameraBlurTargetRef} style={styles.camera}>
            {cameraAvailable === false || cameraMountError ? (
              <View style={[styles.camera, styles.cameraFallback, { backgroundColor: colors.surfaceSunken }]}>
                <EmptyState
                  title={t('loans.scanner.cameraUnavailableTitle')}
                  body={cameraMountError ?? t('loans.scanner.cameraUnavailableBody')}
                  iconIos="camera"
                  iconAndroid="photo_camera"
                />
              </View>
            ) : (
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                onMountError={() => {
                  setCameraMountError(t('loans.scanner.cameraMountFailed'));
                }}
              />
            )}
          </BlurTargetView>
          {cameraAvailable && !cameraMountError ? (
            <View pointerEvents="none" style={styles.viewfinder}>
              <View style={[styles.viewfinderFrame, { borderColor: colors.onChrome }]} />
            </View>
          ) : null}
          <SafeAreaView edges={['bottom']} style={styles.cameraOverlay}>
            <GlassSurface
              androidBlur
              blurTarget={cameraBlurTargetRef}
              intensity="strong"
              style={styles.cameraDock}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.dockHint}>
                {!cameraAvailable || cameraMountError
                  ? t('loans.scanner.cameraUnavailableBody')
                  : t('loans.scanner.cameraPreviewHint')}
              </ThemedText>
              <FormNotice error={formError} notice={formNotice} />
              {cameraAvailable && !cameraMountError ? (
                <Button
                  testID="scanner-capture"
                  label={t('loans.scanner.captureExtract')}
                  loading={isBusy}
                  onPress={() => void captureAndProcess()}
                />
              ) : null}
              <Button
                testID="scanner-gallery"
                label={t('loans.scanner.pickFromGallery')}
                variant={!cameraAvailable || cameraMountError ? 'primary' : 'secondary'}
                loading={isBusy}
                onPress={() => void pickGalleryAndProcess()}
              />
              <Button
                testID="scanner-enter-manual"
                label={t('loans.scanner.enterManually')}
                variant="secondary"
                onPress={startManual}
              />
              <Button
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => setStep('choose')}
              />
            </GlassSurface>
          </SafeAreaView>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader showBack title={t('loans.scanner.reviewTitle')} onBack={goBackFromReview} />
      <ScrollView
        ref={reviewScrollRef}
        scrollEnabled={reviewScrollEnabled}
        contentContainerStyle={styles.reviewContent}
      >
        {localPhotoUri ? (
          <GlassSurface androidBlur style={styles.previewGlass}>
            <Image source={{ uri: localPhotoUri }} style={styles.preview} contentFit="cover" />
          </GlassSurface>
        ) : null}

        <FormNotice
          info={
            ocrPartial
              ? t('loans.scanner.ocrPartialNotice')
              : entryMode === 'scan'
                ? t('loans.scanner.bilingualHint')
                : null
          }
          error={formError}
          notice={formNotice}
        />

        <Card>
          <Field
            label={t('loans.scanner.serialNumber')}
            value={form.serial_number}
            onChangeText={(v) => updateForm('serial_number', v)}
          />
          <Field
            label={t('loans.scanner.customerName')}
            value={form.customer_name}
            onChangeText={(v) => updateForm('customer_name', v)}
          />
          <Field
            label={t('loans.scanner.phoneNumber')}
            value={form.phone_number}
            onChangeText={(v) => updateForm('phone_number', v)}
            keyboardType="phone-pad"
          />
          <Field
            label={t('loans.scanner.address')}
            value={form.address}
            onChangeText={(v) => updateForm('address', v)}
          />
          <Field
            label={t('loans.scanner.loanAmount')}
            value={form.loan_amount_rupees}
            onChangeText={(v) => updateForm('loan_amount_rupees', v)}
            keyboardType="numeric"
          />
          <Field
            label={t('loans.scanner.interestRate')}
            value={form.interest_percent_monthly}
            onChangeText={(v) => updateForm('interest_percent_monthly', v)}
            keyboardType="numeric"
          />
          <Field
            label={t('loans.scanner.disbursedOn')}
            value={form.disbursed_on}
            onChangeText={(v) => updateForm('disbursed_on', v)}
          />
        </Card>

        <ThemedText type="smallBold">{t('loans.scanner.pledgedItems')}</ThemedText>
        {items.map((item, index) => (
          <PledgeItemCard
            key={item.key}
            item={item}
            index={index}
            canRemove={items.length > 1}
            onPatch={(patch) => dispatchItems({ type: 'patch', key: item.key, patch })}
            onRemove={() => dispatchItems({ type: 'remove', key: item.key })}
          />
        ))}
        <Button
          label={t('loans.scanner.addAnotherItem')}
          variant="secondary"
          onPress={() => dispatchItems({ type: 'add' })}
        />

        <Card>
          <ThemedText type="smallBold">{t('loans.scanner.kycSectionTitle')}</ThemedText>
          <KycCaptureFields
            value={kycDraft}
            onChange={setKycDraft}
            testIdPrefix="scanner-kyc"
          />
        </Card>

        <GlassSurface androidBlur style={styles.signatureGlass}>
          <ThemedText type="smallBold">{t('loans.scanner.signatureTitle')}</ThemedText>
          <SignaturePad
            ref={signaturePadRef}
            scrollRef={reviewScrollRef}
            onDrawingChange={(active) => setReviewScrollEnabled(!active)}
            height={Sizes.signaturePadHeight}
            descriptionText={t('loans.scanner.signAbove')}
            testID="scanner-signature-pad"
          />
        </GlassSurface>

        {!localPhotoUri ? (
          <Button
            testID="scanner-attach-receipt"
            label={t('loans.scanner.attachReceipt')}
            variant="secondary"
            onPress={() => void attachReceiptOnReview()}
          />
        ) : null}

        <Button
          testID="scanner-save"
          label={t('loans.scanner.saveGirviLoan')}
          loading={isBusy}
          onPress={() => void handleSave()}
        />
        {entryMode === 'scan' ? (
          <Button
            testID="scanner-retake"
            label={t('loans.scanner.retake')}
            variant="secondary"
            onPress={() => {
              setLocalPhotoUri(null);
              setOcrPartial(false);
              setStep('camera');
            }}
          />
        ) : (
          <Button
            label={t('common.back')}
            variant="secondary"
            onPress={() => setStep('choose')}
          />
        )}
        {photoGap ? (
          <Button
            label={t('loans.scanner.retryPhotos')}
            variant="secondary"
            loading={isBusy}
            onPress={() => void retryPhotos(photoGap)}
          />
        ) : null}
        {savedLoanId ? (
          <>
            <Button
              label={t('loans.scanner.viewLoan')}
              onPress={() => router.replace(`/(admin)/loan/${savedLoanId}`)}
            />
            {kycPendingCustomerId ? (
              <Button
                testID="scanner-open-kyc"
                label={t('loans.scanner.openKyc')}
                variant="secondary"
                onPress={() => router.push(`/(admin)/kyc/${kycPendingCustomerId}`)}
              />
            ) : null}
            <Button
              label={t('loans.scanner.goToLoans')}
              variant="secondary"
              onPress={() => router.replace(ADMIN_LOANS_HREF)}
            />
          </>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  choiceBody: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  choiceGlass: {
    borderRadius: Radii.md,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  cameraStage: { flex: 1 },
  camera: { flex: 1 },
  cameraFallback: {
    justifyContent: 'center',
  },
  viewfinder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Spacing.five * 4,
  },
  viewfinderFrame: {
    width: '78%',
    aspectRatio: 1,
    borderRadius: Radii.md,
    borderWidth: Sizes.hairline * 2,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  cameraDock: {
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  dockHint: { textAlign: 'center' },
  reviewContent: { padding: Spacing.four, gap: Spacing.three },
  previewGlass: {
    borderRadius: Radii.md,
    padding: Spacing.one,
  },
  preview: { width: '100%', height: Sizes.imagePreviewHeight, borderRadius: Radii.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  signatureGlass: {
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
