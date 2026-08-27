/**
 * Public privacy policy for Google Play listing and App Links users.
 * Must remain reachable signed-out (AuthGate allowlist).
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const LAST_UPDATED = '26 August 2026';

export default function PrivacyPolicyScreen() {
  const colors = useTheme();

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <BrandMark size="lg" />
        </View>
        <ThemedText style={[TypeScale.title, { color: colors.text }]}>
          Privacy Policy — GIRVI SEWA
        </ThemedText>
        <ThemedText style={[TypeScale.label, { color: colors.textSecondary }]}>
          Last updated: {LAST_UPDATED}
        </ThemedText>

        <Section title="Who we are">
          GIRVI SEWA is record-keeping software for a pawn-broking shop. Shop
          staff keep pledge records and receipts in the app. Customers may view
          their own receipts after signing in. Money moves at the shop counter —
          this app does not collect repayments online and does not let customers
          apply for credit inside the app.
        </Section>

        <Section title="Data we process">
          Depending on how the shop uses the app, we may process: mobile number
          and PIN (or OTP) for sign-in; customer name and contact details entered
          by shop staff; pledge / receipt records and calculated amounts; photos
          of pledged items, paper receipts, and identity documents captured by
          shop staff; and device identifiers needed to deliver optional
          reminders.
        </Section>

        <Section title="Why we process it">
          To operate the shop ledger, show customers their own receipts, verify
          sign-in, store images the shop attaches to records, and send
          reminders the shop configures. Processing is for the shop’s
          record-keeping and the customer’s receipt viewing — not for selling
          personal data.
        </Section>

        <Section title="Who can see it">
          Shop owners and authorised staff see records for their shop.
          Customers see only their own receipts and related records after
          signing in. Access is enforced with server-side security rules (not
          only by the app UI).
        </Section>

        <Section title="Storage and providers">
          App data is stored with our cloud database and file storage provider
          (Supabase). The website may be hosted on Vercel. Data is transmitted
          over HTTPS. Retention follows the shop’s operational needs and
          applicable law; shops may ask to correct or delete records they
          control.
        </Section>

        <Section title="Permissions on Android">
          Camera / photo library access is used only when shop staff attach
          receipt, item, or identity photos. Notifications, if enabled, are for
          shop-configured reminders. We do not use these permissions to collect
          payments.
        </Section>

        <Section title="Children">
          The app is intended for shop operators and adult customers of the
          pawn-broking shop. It is not directed at children under 13.
        </Section>

        <Section title="Delete account and data">
          Customers: ask the shop that issued your receipt to delete your
          profile and linked records. Shop owners/staff: email the developer
          via the Google Play listing contact email with your sign-in mobile
          number and a deletion request. Full steps:
          https://girvi-sewa.vercel.app/delete-account
        </Section>

        <Section title="Contact">
          For privacy requests about your shop’s records, contact the shop that
          issued your receipt. For questions about this policy for the GIRVI
          SEWA software product, contact the developer through the Google Play
          store listing contact email.
        </Section>

        <View style={styles.footer}>
          <ThemedText style={[TypeScale.caption, { color: colors.textSecondary }]}>
            This page is a product privacy notice for store listing compliance.
            It is not legal advice. Shops remain responsible for how they handle
            customer data under applicable Indian law.
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
  root: {
    flex: 1,
  },
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
  section: {
    gap: Spacing.two,
  },
  footer: {
    marginTop: Spacing.three,
  },
});
