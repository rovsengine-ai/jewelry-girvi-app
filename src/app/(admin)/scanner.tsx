import { useCallback, useReducer, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import { GoldRateCard } from '@/components/gold-rate-card';
import { Row } from '@/components/row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { todayInKolkata } from '@/lib/money';
import { useAuth } from '@/providers/auth-provider';
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

const GOLD_PURITY_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Not assessed', value: null },
  { label: '24K (999)', value: 24 },
  { label: '22K (916)', value: 22 },
  { label: '18K (75% / 750)', value: 18 },
  { label: '14K (585)', value: 14 },
  { label: '10K (417)', value: 10 },
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
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.backgroundSelected : colors.elevated,
          borderColor: colors.border,
        },
      ]}>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
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
  return (
    <Card>
      <Row>
        <ThemedText type="smallBold">Item {index + 1}</ThemedText>
        {canRemove ? <Button label="Remove" variant="secondary" onPress={onRemove} /> : null}
      </Row>

      <ThemedText type="small">Metal (required)</ThemedText>
      <View style={styles.chipRow}>
        {(['gold', 'silver'] as const).map((metal: PledgeMetal) => (
          <ChoiceChip
            key={metal}
            label={metal === 'gold' ? 'Gold' : 'Silver'}
            selected={item.metal === metal}
            onPress={() => onPatch({ metal })}
          />
        ))}
      </View>

      <Field
        label="Ornament type"
        value={item.ornament_type}
        onChangeText={(ornament_type) => onPatch({ ornament_type })}
      />
      <Field
        label="Description"
        value={item.description}
        onChangeText={(description) => onPatch({ description })}
      />
      <Field
        label="Gross weight (grams)"
        value={item.gross_grams}
        onChangeText={(gross_grams) => onPatch({ gross_grams })}
        keyboardType="numeric"
      />
      <Field
        label="Stone deduction (grams)"
        value={item.stone_grams}
        onChangeText={(stone_grams) => onPatch({ stone_grams })}
        keyboardType="numeric"
      />
      <Field
        label="Net weight (grams)"
        value={item.net_grams}
        onChangeText={(net_grams) => onPatch({ net_grams })}
        keyboardType="numeric"
        error={
          (() => {
            try {
              return gramsInputToMg(item.net_grams) > gramsInputToMg(item.gross_grams)
                ? 'Net weight cannot exceed gross weight.'
                : null;
            } catch {
              return null;
            }
          })()
        }
      />
      <Field
        label="Quantity"
        value={item.quantity}
        onChangeText={(quantity) => onPatch({ quantity })}
        keyboardType="numeric"
      />

      {item.metal === 'gold' ? (
        <>
          <ThemedText type="small">Purity (optional — do not assume 22K)</ThemedText>
          <View style={styles.chipRow}>
            {GOLD_PURITY_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.label}
                label={option.label}
                selected={item.purity_karat === option.value}
                onPress={() => onPatch({ purity_karat: option.value })}
              />
            ))}
          </View>
        </>
      ) : item.metal === 'silver' ? (
        <ThemedText type="small">
          Silver is weight-only. No purity and no valuation.
        </ThemedText>
      ) : (
        <ThemedText type="small">Choose gold or silver before saving. Nothing is pre-selected.</ThemedText>
      )}
    </Card>
  );
}

export default function AdminScannerScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { profile } = useAuth();

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
        throw new Error('Camera did not return an image.');
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
      setFormError(error instanceof Error ? error.message : 'Unknown error');
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
      setFormNotice('Item photos attached.');
    } catch (retryError) {
      if (retryError instanceof LoanPhotosIncompleteError) {
        setPhotoGap(retryError);
        setSavedLoanId(retryError.loanId);
        setFormError(retryError.message);
      } else {
        setFormError(retryError instanceof Error ? retryError.message : 'Unknown error');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
    if (!localPhotoUri) {
      setFormError('Capture a receipt image before saving.');
      return;
    }

    setIsBusy(true);
    setFormError(null);
    setFormNotice(null);
    try {
      const loanId = await createLoanWithCustomer(form, items, localPhotoUri, signatureDataUrl);
      setSavedLoanId(loanId);
      setPhotoGap(null);
      setFormNotice('Girvi loan created successfully.');
    } catch (error) {
      if (error instanceof LoanPhotosIncompleteError) {
        setPhotoGap(error);
        setSavedLoanId(error.loanId);
        setFormError(error.message);
        return;
      }
      setFormError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsBusy(false);
    }
  };

  if (!permission) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={styles.centered}>
        <EmptyState
          title="Camera needed"
          body="Camera permission is required to scan receipts."
          actionLabel="Grant permission"
          onAction={() => void requestPermission()}
        />
      </ThemedView>
    );
  }

  if (step === 'camera') {
    return (
      <ThemedView style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <SafeAreaView style={styles.cameraOverlay}>
          <ThemedText
            style={[
              TypeScale.display,
              { color: colors.overlay, textShadowColor: colors.overlayShadow, textShadowRadius: 6 },
            ]}>
            Scan Girvi Receipt
          </ThemedText>
          <FormNotice error={formError} />
          <Button label="Capture & Extract" loading={isBusy} onPress={() => void captureAndProcess()} />
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.reviewContent}>
        <ThemedText type="subtitle">Review & Save</ThemedText>

        {localPhotoUri ? <Image source={{ uri: localPhotoUri }} style={styles.preview} contentFit="cover" /> : null}

        <GoldRateCard isOwner={profile?.role === 'owner'} />

        <Field label="Serial Number" value={form.serial_number} onChangeText={(v) => updateForm('serial_number', v)} />
        <Field label="Customer Name" value={form.customer_name} onChangeText={(v) => updateForm('customer_name', v)} />
        <Field
          label="Phone Number"
          value={form.phone_number}
          onChangeText={(v) => updateForm('phone_number', v)}
          keyboardType="phone-pad"
        />
        <Field label="Address" value={form.address} onChangeText={(v) => updateForm('address', v)} />
        <Field
          label="Loan Amount (₹)"
          value={form.loan_amount_rupees}
          onChangeText={(v) => updateForm('loan_amount_rupees', v)}
          keyboardType="numeric"
        />
        <Field
          label="Interest Rate (% per 30 days)"
          value={form.interest_percent_monthly}
          onChangeText={(v) => updateForm('interest_percent_monthly', v)}
          keyboardType="numeric"
        />
        <Field
          label="Disbursed on (YYYY-MM-DD)"
          value={form.disbursed_on}
          onChangeText={(v) => updateForm('disbursed_on', v)}
        />

        <ThemedText type="smallBold">Pledged items</ThemedText>
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
        <Button label="Add another item" variant="secondary" onPress={() => dispatchItems({ type: 'add' })} />

        <ThemedText type="smallBold">Customer Digital Signature</ThemedText>
        <View style={styles.signatureBox}>
          <SignatureCanvas
            ref={signatureRef}
            onOK={(sig) => setSignatureDataUrl(sig)}
            onEmpty={() => setSignatureDataUrl(null)}
            descriptionText="Sign above"
            clearText="Clear"
            confirmText="Save"
            webStyle={`.m-signature-pad { box-shadow: none; border: none; }`}
            style={styles.signatureCanvas}
          />
        </View>

        <Button label="Save Girvi Loan" loading={isBusy} onPress={() => void handleSave()} />
        <FormNotice error={formError} notice={formNotice} />
        {photoGap ? (
          <Button
            label="Retry photos"
            variant="secondary"
            loading={isBusy}
            onPress={() => void retryPhotos(photoGap)}
          />
        ) : null}
        {savedLoanId ? (
          <>
            <Button
              label="View loan"
              onPress={() => router.replace(`/(admin)/loan/${savedLoanId}`)}
            />
            <Button
              label="Dashboard"
              variant="secondary"
              onPress={() => router.replace('/(admin)/dashboard')}
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
