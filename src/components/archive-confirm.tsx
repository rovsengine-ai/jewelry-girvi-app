/**
 * Typed-reason overlay for archive. Confirm stays disabled until the owner
 * types a reason. Copy says the girvi disappears for customer and staff;
 * the shop keeps the record.
 */
import { StyleSheet, View } from 'react-native';

import { Button, type ButtonVariant } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';

export function ArchiveConfirm({
  serial,
  reason,
  onChangeReason,
  onCancel,
  onConfirm,
  loading = false,
  error,
  title,
  body,
  confirmLabel,
  confirmVariant = 'danger',
  reasonLabel,
  reasonPlaceholder,
  testID = 'archive-confirm',
  confirmTestID = 'archive-confirm-button',
  reasonTestID = 'archive-reason',
}: {
  serial: string;
  reason: string;
  onChangeReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
  error?: string | null;
  title?: string;
  body?: string;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  testID?: string;
  confirmTestID?: string;
  reasonTestID?: string;
}) {
  const colors = useTheme();
  const { t } = useLanguage();
  const reasonReady = reason.trim() !== '';

  return (
    <View testID={testID} style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <Card>
        <ThemedText type="smallBold">{title ?? t('archive.confirmTitle', { serial })}</ThemedText>
        <ThemedText type="small">{body ?? t('archive.confirmBody')}</ThemedText>
        <FormNotice error={error} />
        <Field
          label={reasonLabel ?? t('archive.reasonLabel')}
          value={reason}
          onChangeText={onChangeReason}
          placeholder={reasonPlaceholder ?? t('archive.reasonPlaceholder')}
          testID={reasonTestID}
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
        <Button
          testID={confirmTestID}
          label={confirmLabel ?? t('archive.archive')}
          variant={confirmVariant}
          disabled={!reasonReady}
          loading={loading}
          onPress={onConfirm}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
