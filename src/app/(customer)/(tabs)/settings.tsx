import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppIcon, TintedIconWell } from '@/components/app-icon';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { LanguageSettingsRow, ScreenHeader } from '@/components/screen-header';
import { SectionLabel } from '@/components/section-label';
import { SettingsGroup } from '@/components/settings-group';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTabBarScrollPadding } from '@/hooks/use-tab-bar-scroll-padding';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';

export default function CustomerSettingsScreen() {
  const colors = useTheme();
  const { profile, signOut } = useAuth();
  const { t } = useLanguage();
  const tabBarPadding = useTabBarScrollPadding();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState(false);

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader title={t('settings.title')} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        {profile ? (
          <Card style={styles.accountCard}>
            <View style={styles.accountRow}>
              <TintedIconWell tint={colors.tintPrimary}>
                <AppIcon ios="person.fill" android="person" color={colors.primary} />
              </TintedIconWell>
              <View style={styles.accountCopy}>
                {profile.full_name ? (
                  <ThemedText type="bodyLarge">{profile.full_name}</ThemedText>
                ) : null}
                {profile.phone_number ? (
                  <ThemedText type="label" style={{ color: colors.accentWarning }}>
                    {profile.phone_number}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          </Card>
        ) : null}
        <SectionLabel>{t('settings.groupPreferences')}</SectionLabel>
        <SettingsGroup>
          <LanguageSettingsRow />
        </SettingsGroup>
        {Platform.OS === 'web' ? (
          <>
            <SectionLabel>{t('notices.customer.title')}</SectionLabel>
            <Card style={styles.accountCard} testID="reminders-web-note">
              <ThemedText type="small" themeColor="textSecondary">
                {t('settings.remindersWebNote')}
              </ThemedText>
            </Card>
          </>
        ) : null}
        <SectionLabel>{t('settings.groupAccount')}</SectionLabel>
        <SettingsGroup>
          <ListRow
            testID="delete-account"
            tone="elevated"
            isLast
            onPress={() => {
              setDeleteNotice(false);
              setDeleteOpen(true);
            }}
            leading={
              <TintedIconWell tint={colors.tintDanger}>
                <AppIcon ios="trash" android="delete" color={colors.onTintDanger} />
              </TintedIconWell>
            }
            content={
              <ThemedText type="bodyLarge" style={{ color: colors.danger }}>
                {t('settings.deleteAccount')}
              </ThemedText>
            }
          />
        </SettingsGroup>
        <SectionLabel>{t('settings.groupSession')}</SectionLabel>
        <SettingsGroup>
          <ListRow
            testID="sign-out"
            tone="elevated"
            isLast
            onPress={() => void signOut()}
            leading={
              <TintedIconWell tint={colors.tintDanger}>
                <AppIcon
                  ios="rectangle.portrait.and.arrow.right"
                  android="logout"
                  color={colors.onTintDanger}
                />
              </TintedIconWell>
            }
            content={
              <ThemedText type="bodyLarge" style={{ color: colors.danger }}>
                {t('common.signOut')}
              </ThemedText>
            }
          />
        </SettingsGroup>
      </ScrollView>
      {deleteOpen ? (
        <View
          testID="delete-account-confirm"
          style={[styles.overlay, { backgroundColor: colors.overlay }]}
        >
          <Card style={styles.confirmCard}>
            <ThemedText type="smallBold">{t('settings.deleteAccountTitle')}</ThemedText>
            <ThemedText type="small">{t('settings.deleteAccountBody')}</ThemedText>
            {deleteNotice ? (
              <ThemedText type="small" themeColor="textSecondary" testID="delete-account-notice">
                {t('settings.deleteAccountUnavailable')}
              </ThemedText>
            ) : null}
            <Button
              label={t('common.cancel')}
              variant="secondary"
              onPress={() => {
                setDeleteOpen(false);
                setDeleteNotice(false);
              }}
            />
            <Button
              testID="delete-account-confirm-button"
              label={t('settings.deleteAccountConfirm')}
              variant="danger"
              onPress={() => {
                // UI-only for Play listing; no RPC / anonymise / hard delete yet.
                setDeleteNotice(true);
              }}
            />
          </Card>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  accountCard: { marginHorizontal: Spacing.four },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  accountCopy: { flex: 1, minWidth: 0, gap: Spacing.half },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  confirmCard: { gap: Spacing.three },
});
