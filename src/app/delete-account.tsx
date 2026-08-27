/**
 * Public account / data deletion instructions for Google Play Data safety.
 * Must remain reachable signed-out (AuthGate allowlist).
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function DeleteAccountScreen() {
  const colors = useTheme();

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <BrandMark size="lg" />
        </View>
        <ThemedText style={[TypeScale.title, { color: colors.text }]}>
          Delete account & data — GIRVI SEWA
        </ThemedText>
        <ThemedText style={[TypeScale.body, { color: colors.textSecondary }]}>
          Use these steps to request deletion of your GIRVI SEWA sign-in account
          and associated personal data.
        </ThemedText>

        <Section title="Customers">
          Contact the pawn-broking shop that issued your receipt (in person or by
          the phone number on your receipt). Ask them to delete your customer
          profile and linked pledge / receipt records from GIRVI SEWA. The shop
          controls those records as the data controller for shop ledger data.
        </Section>

        <Section title="Shop owners and staff">
          Email the GIRVI SEWA developer using the contact email on the Google
          Play store listing. Include: (1) the mobile number used to sign in,
          (2) shop / business name, and (3) a clear request to delete the
          account. We will verify ownership and delete or anonymise account
          credentials and app-linked personal data we control, typically within
          30 days, except where the shop must retain ledger records under
          applicable law.
        </Section>

        <Section title="What is deleted">
          Sign-in credentials (mobile / PIN account), profile fields we store for
          that user, and personal photos attached only to that user where we are
          asked and legally able to remove them. Shop operational ledger entries
          may be retained or anonymised as required for the shop’s compliance —
          the shop can confirm what they keep.
        </Section>

        <Section title="Privacy policy">
          More detail: https://girvi-sewa.vercel.app/privacy
        </Section>

        <View style={styles.footer}>
          <ThemedText style={[TypeScale.caption, { color: colors.textSecondary }]}>
            This page is for Play Store Data safety compliance. It is not legal
            advice.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  const colors = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText style={[TypeScale.bodyBold, { color: colors.text }]}>{title}</ThemedText>
      <ThemedText style={[TypeScale.body, { color: colors.textSecondary }]}>{children}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  brandRow: {
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  section: { gap: Spacing.two },
  footer: { marginTop: Spacing.three },
});
