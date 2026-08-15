import { useCallback, useReducer, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureCanvas from 'react-native-signature-canvas';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { PressableScale } from '@/components/pressable-scale';
import { Row } from '@/components/row';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { todayInKolkata } from '@/lib/money';
import { ADMIN_LOANS_HREF } from '@/lib/shop-tab-access';
import { useLanguage } from '@/providers/language-provider';
import {
  emptyScannerItem,
  scannerItemsReducer,
  type PledgeMetal,
  type ScannerItemDraft,
} from '@/lib/scanner-items';
import { gramsInputToMg } from '@/lib/weight';
import {
  attachItemPhotos,
  createLoanWithCustomer,
  LoanPhotosIncompleteError,
} from '@/services/loanService';
import { extractReceiptData } from '@/services/ocrService';
import type { LoanFormData } from '@/types/database';

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

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.backgroundSelected : colors.elevated,
          borderColor: colors.border,
        },
      ]}>
      <ThemedText type="small">{label}</ThemedText>
    </PressableScale>
  );
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

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const signatureRef = useRef<ComponentRef<typeof SignatureCanvas> | null>(null);

  const [step, setStep] = useState<'camera' | 'review'>('camera');
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [form, setForm] = useState<LoanFormData>(emptyForm);
  const [items, dispatchItems] = useReducer(scannerItemsReducer, [emptyScannerItem('item-1')]);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [savedLoanId, setSavedLoanId] = useState<string | null>(null);
  const [photoGap, setPhotoGap] = useState<LoanPhotosIncompleteError | null>(null);

  const updateForm = useCallback((key: keyof LoanFormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const captureAndProcess = async () => {
    if (!cameraRef.current) return;

    setIsBusy(true);
    setFormError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) {
        throw new Error(t('loans.scanner.cameraNoImage'));
      }

      setLocalPhotoUri(photo.uri);
      const extracted = await extractReceiptData(photo.uri);
      setForm({
        serial_number: extracted.serial_number,
        customer_name: extracted.customer_name,
        phone_number: extracted.phone_number,
        address: extracted.address,
        loan_amount_rupees: extracted.loan_amount ? String(extracted.loan_amount) : '',
        interest_percent_monthly: extracted.interest_rate ? String(extracted.interest_rate) : '3',
        disbursed_on: extracted.date || todayInKolkata(),
      });
      dispatchItems({
        type: 'seedFromOcr',
        ornamentType: extracted.item_name,
        grossGrams: extracted.weight_grams ? String(extracted.weight_grams) : '',
      });
      setStep('review');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('errors.unknown'));
    } finally {
      setIsBusy(false);
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
    if (!localPhotoUri) {
      setFormError(t('loans.scanner.captureBeforeSave'));
      return;
    }

    setIsBusy(true);
    setFormError(null);
    setFormNotice(null);
    try {
      const loanId = await createLoanWithCustomer(form, items, localPhotoUri, signatureDataUrl);
      setSavedLoanId(loanId);
      setPhotoGap(null);
      setFormNotice(t('loans.scanner.createdSuccess'));
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

  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('loans.scanner.cameraTitle')} />
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('loans.scanner.cameraTitle')} />
        <View style={styles.centered}>
          <EmptyState
            title={t('loans.scanner.cameraNeededTitle')}
            body={t('loans.scanner.cameraNeededBody')}
            actionLabel={t('common.grantPermission')}
            onAction={() => void requestPermission()}
          />
        </View>
      </ThemedView>
    );
  }

  if (step === 'camera') {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('loans.scanner.cameraTitle')} />
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <SafeAreaView edges={['bottom']} style={styles.cameraOverlay}>
          <FormNotice error={formError} />
          <Button
            label={t('loans.scanner.captureExtract')}
            loading={isBusy}
            onPress={() => void captureAndProcess()}
          />
          <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title={t('loans.scanner.reviewTitle')} />
      <ScrollView contentContainerStyle={styles.reviewContent}>
        {localPhotoUri ? <Image source={{ uri: localPhotoUri }} style={styles.preview} contentFit="cover" /> : null}

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

        <ThemedText type="smallBold">{t('loans.scanner.signatureTitle')}</ThemedText>
        <View style={styles.signatureBox}>
          <SignatureCanvas
            ref={signatureRef}
            onOK={(sig) => setSignatureDataUrl(sig)}
            onEmpty={() => setSignatureDataUrl(null)}
            descriptionText={t('loans.scanner.signAbove')}
            clearText={t('common.clear')}
            confirmText={t('common.save')}
            webStyle={`.m-signature-pad { box-shadow: none; border: none; }`}
            style={styles.signatureCanvas}
          />
        </View>

        <Button
          label={t('loans.scanner.saveGirviLoan')}
          loading={isBusy}
          onPress={() => void handleSave()}
        />
        <FormNotice error={formError} notice={formNotice} />
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.four, gap: Spacing.three },
  camera: { flex: 1 },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  reviewContent: { padding: Spacing.four, gap: Spacing.three },
  preview: { width: '100%', height: 200, borderRadius: Radii.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: {
    minHeight: MinTouchTarget,
    borderRadius: Radii.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  signatureBox: { height: 220, borderRadius: Radii.md, overflow: 'hidden' },
  signatureCanvas: { flex: 1 },
});
