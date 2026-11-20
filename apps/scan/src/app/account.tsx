import {
  fetchAppleSubscription,
  fetchScanPlan,
  formatMongolianPhone,
  formatProUntil,
  type AppleProSubscription,
  type ScanPlan,
} from '@bairmair/browse';
import { ACCOUNT_PATH } from '@bairmair/db';
import { openSitePage, signOut, useAuth } from '@bairmair/native-auth';
import { Button } from '@bairmair/native-ui/button';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Icon, type IconName } from '@bairmair/native-ui/icon';
import { Text } from '@bairmair/native-ui/text';
import { radius, useColors } from '@bairmair/native-ui/theme';
import { formatScanTime } from '@bairmair/scanner';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { forgetScansOf } from '@/uploads/uploads';

/**
 * Deletes the account for good on the server (`DELETE /api/account`: scans, listings, the Auth
 * user), then this user's scans on the phone, then signs out here (the server session is gone).
 */
async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session) throw new Error('not signed in');
  const response = await fetch(`${env.apiUrl}${ACCOUNT_PATH}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error(`account deletion failed: HTTP ${response.status}`);
  forgetScansOf(session.user.id);
  await supabase.auth.signOut({ scope: 'local' });
}

export default function AccountScreen() {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const { session } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [plan, setPlan] = useState<ScanPlan | null>(null);
  const [apple, setApple] = useState<AppleProSubscription | null>(null);

  const user = session?.user;
  const userId = user?.id ?? null;

  // The plan (free, or Pro bought in any way). Never where to buy it (App Store rule 3.1.3).
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true;
      fetchScanPlan(supabase)
        .then((next) => active && setPlan(next))
        .catch(() => undefined);
      fetchAppleSubscription(supabase)
        .then((next) => active && setApple(next))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [userId]),
  );
  const who = user?.phone
    ? formatMongolianPhone(user.phone)
    : (user?.email ?? t('account.methods.apple'));

  const confirmSignOut = () =>
    Alert.alert(t('account.signOutTitle'), undefined, [
      { text: t('account.cancel'), style: 'cancel' },
      { text: t('account.signOut'), onPress: () => void signOut(supabase).catch(() => undefined) },
    ]);

  const confirmDelete = () =>
    Alert.alert(
      t('account.deleteTitle'),
      // Apple keeps billing a subscription whose account is gone (App Store rule 5.1.1(v)).
      apple && apple.autoRenew !== false
        ? `${t('account.deleteBody')}\n\n${t('scanApp.pro.deleteNote')}`
        : t('account.deleteBody'),
      [
        { text: t('account.cancel'), style: 'cancel' },
        {
          text: t('account.deleteConfirm'),
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            deleteAccount()
              .then(() => Alert.alert(t('account.deleted')))
              .catch(() => Alert.alert(t('account.deleteFailed')))
              .finally(() => setDeleting(false));
          },
        },
      ],
    );

  const version = Constants.expoConfig?.version ?? '?';
  const created = !Updates.isEmbeddedLaunch && Updates.createdAt ? Updates.createdAt : null;
  const source = created
    ? t('account.versionUpdate', { date: formatScanTime(created.toISOString()) })
    : t('account.versionBuiltIn');

  const group = [styles.group, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {user ? (
        <View style={group}>
          <View style={styles.profile}>
            <View style={[styles.avatar, { backgroundColor: colors.ink }]}>
              <Icon name="person" size={24} color={colors.onInk} />
            </View>
            <Text style={[styles.heading, { color: colors.text }]}>{who}</Text>
          </View>
          <Text style={[styles.small, { color: colors.textMuted }]}>
            {t('scanApp.accountNote')}
          </Text>
          {plan && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/pro')}
                style={({ pressed }) => [styles.planRow, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.small, { color: colors.textMuted }]}>{t('scanApp.plan')}</Text>
                <View style={styles.planText}>
                  <Text
                    style={[
                      styles.body,
                      styles.strong,
                      { color: plan.proUntil ? colors.brand : colors.text },
                    ]}
                  >
                    {plan.proUntil
                      ? t('scanApp.planPro', { date: formatProUntil(plan.proUntil, locale) })
                      : t('scanApp.planFree', { kept: plan.kept, limit: plan.limit })}
                  </Text>
                  {plan.proUntil ? (
                    <Text style={[styles.small, { color: colors.textMuted }]}>
                      {t('scanApp.planProKept', { kept: plan.kept })}
                    </Text>
                  ) : (
                    <Text style={[styles.small, { color: colors.accent }]}>
                      {t('scanApp.upgrade')}
                    </Text>
                  )}
                </View>
                <Icon name="chevron" size={14} color={colors.textSubtle} />
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <View style={group}>
          <Text style={[styles.body, { color: colors.textMuted }]}>{t('scanApp.signInBody')}</Text>
          <Button title={t('account.signIn')} onPress={() => router.push('/sign-in')} />
        </View>
      )}

      <Text style={[styles.eyebrow, { color: colors.textSubtle }]}>
        {t('footer.legal').toUpperCase()}
      </Text>
      <View style={group}>
        <Row
          icon="document"
          label={t('footer.terms')}
          onPress={() => openSitePage(env.siteUrl, 'terms', locale)}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row
          icon="privacy"
          label={t('footer.privacy')}
          onPress={() => openSitePage(env.siteUrl, 'privacy', locale)}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row
          icon="wrench"
          label={t('scanApp.diagnostics.title')}
          onPress={() => router.push('/diagnostics')}
        />
      </View>

      {user && (
        <>
          <Button
            title={t('account.signOut')}
            icon="logout"
            variant="outline"
            onPress={confirmSignOut}
          />
          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={confirmDelete}
            style={styles.deleteRow}
          >
            <Icon name="trash" size={16} color={colors.danger} />
            <Text style={[styles.body, { color: colors.danger }]}>
              {deleting ? t('account.deleting') : t('account.deleteAccount')}
            </Text>
          </Pressable>
        </>
      )}

      <Text style={[styles.small, styles.version, { color: colors.textMuted }]}>
        {t('account.version', { version })} · {source}
      </Text>
    </ScrollView>
  );
}

function Row({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={18} color={colors.textMuted} />
      <Text style={[styles.body, styles.grow, { color: colors.text }]}>{label}</Text>
      <Icon name="chevron" size={14} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  group: { borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  grow: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  planText: { alignItems: 'flex-end', flexShrink: 1 },
  strong: { fontWeight: '600' },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 8,
  },
  version: { textAlign: 'center' },
});
