/**
 * Admin loans list row: UI-thread swipe-left (ReanimatedSwipeable).
 * https://docs.swmansion.com/react-native-gesture-handler/docs/components/reanimated_swipeable
 * Call: https://docs.expo.dev/versions/v57.0.0/sdk/linking/
 *
 * Archive is owner-only. Confirm stays disabled until a reason is typed.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import Animated from 'react-native-reanimated';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ArchiveConfirm } from '@/components/archive-confirm';
import { AvatarMonogram } from '@/components/avatar-monogram';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { unknownMessage } from '@/i18n';
import { asPaise } from '@/lib/money';
import { rowEntering } from '@/lib/motion';
import { telHref } from '@/lib/phone';
import { parseOwnerOnlyError } from '@/lib/redemption';
import { useLanguage } from '@/providers/language-provider';
import type { LoanWithCustomer } from '@/types/database';

export function AdminLoanRow({
  loan,
  index,
  reduceMotion,
  canArchive,
  isLast = false,
  onPress,
  onArchive,
}: {
  loan: LoanWithCustomer;
  index: number;
  reduceMotion: boolean;
  canArchive: boolean;
  isLast?: boolean;
  onPress: () => void;
  onArchive: (reason: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const mountedRef = useRef(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const phoneHref = telHref(loan.profiles?.phone_number);
  const name = loan.profiles?.full_name ?? t('common.unknownCustomer');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const hasActions = Boolean(phoneHref) || canArchive;

  const closeConfirm = () => {
    setConfirmOpen(false);
    setReason('');
    setFormError(null);
  };

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (trimmed === '') return;
    setFormError(null);
    setIsSaving(true);
    try {
      await onArchive(trimmed);
      if (!mountedRef.current) return;
      closeConfirm();
      swipeableRef.current?.close();
    } catch (error) {
      if (!mountedRef.current) return;
      const message = unknownMessage(error, t);
      setFormError(parseOwnerOnlyError(message) ? t('archive.ownerOnly') : message);
    } finally {
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  return (
    <Animated.View entering={rowEntering(index, reduceMotion)}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        testID={`loan-row-swipe-${loan.id}`}
        enabled={hasActions}
        overshootRight={false}
        renderRightActions={() => (
          <View style={styles.actions}>
            {phoneHref ? (
              <Button
                testID="loan-row-call"
                label={t('archive.call')}
                onPress={() => {
                  void Linking.openURL(phoneHref);
                }}
                style={styles.action}
              />
            ) : null}
            {canArchive ? (
              <Button
                testID="loan-row-archive"
                label={t('archive.archive')}
                variant="danger"
                onPress={() => {
                  setFormError(null);
                  setReason('');
                  setConfirmOpen(true);
                }}
                style={styles.action}
              />
            ) : null}
          </View>
        )}>
        <ListRow
          testID={`loan-row-${loan.serial_number}`}
          onPress={onPress}
          isLast={isLast}
          leading={<AvatarMonogram name={loan.profiles?.full_name} />}
          content={
            <>
              <ThemedText type="bodyLarge" numberOfLines={1} ellipsizeMode="tail">
                {name}
              </ThemedText>
              <ThemedText
                type="label"
                themeColor="textSecondary"
                numberOfLines={1}
                ellipsizeMode="tail"
                testID={`loan-serial-${loan.serial_number}`}>
                {loan.serial_number} · {loan.item_name}
              </ThemedText>
            </>
          }
          trailing={
            <>
              <MoneyText paise={asPaise(loan.principal_paise)} />
              <Badge status={loan.status} style={styles.badge} />
            </>
          }
        />
      </ReanimatedSwipeable>

      {confirmOpen ? (
        <ArchiveConfirm
          serial={loan.serial_number}
          reason={reason}
          onChangeReason={setReason}
          onCancel={closeConfirm}
          onConfirm={() => void handleConfirm()}
          loading={isSaving}
          error={formError}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  action: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radii.sm,
  },
  badge: {
    minHeight: MinTouchTarget,
    alignSelf: 'flex-end',
  },
});
