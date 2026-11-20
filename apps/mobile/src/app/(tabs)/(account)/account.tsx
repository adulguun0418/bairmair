import { LOCALES } from '@bairmair/i18n';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { AgentSection } from '@/account/agent-section';
import { deleteAccount } from '@/account/delete-account';
import { signOut } from '@/auth/actions';
import { useAuth } from '@/auth/auth-provider';
import { authErrorKey, formatMongolianPhone } from '@bairmair/browse';
import { useI18n } from '@bairmair/native-ui/i18n';
import { openSitePage } from '@/lib/site-pages';
import { supabase } from '@/lib/supabase';
import { setThemePreference, THEME_PREFERENCES, useThemePreference } from '@/ui/appearance';
import { BlueprintPanel } from '@bairmair/native-ui/blueprint-panel';
import { Button } from '@bairmair/native-ui/button';
import { Icon, type IconName } from '@bairmair/native-ui/icon';
import { Segmented } from '@/ui/segmented';
import { TextField } from '@/ui/text-field';
import { radius, useColors } from '@bairmair/native-ui/theme';
import { Text } from '@bairmair/native-ui/text';

const METHODS = ['phone', 'apple', 'google', 'email'] as const;
type Method = (typeof METHODS)[number];

function isMethod(value: unknown): value is Method {
  return typeof value === 'string' && (METHODS as readonly string[]).includes(value);
}

/** The saved display name (empty when none). */
async function loadDisplayName(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).single();
  return data?.display_name ?? '';
}

/** Up to two initials from a name ("Бат Дорж" → "БД"). */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Signed out: a way in. Signed in: who you are (name, phone, needed to publish), the agent page,
 * app settings, and at the bottom sign-out and account deletion.
 */
export default function AccountScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const { session, ready } = useAuth();
  const user = session?.user ?? null;

  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Bumped by pull to refresh, so the agent card loads again. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void loadDisplayName(user.id).then((saved) => {
      if (!active) return;
      setName(saved);
      setSavedName(saved);
    });
    return () => {
      active = false;
    };
  }, [user]);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <BlueprintPanel
          icon="person"
          title={t('seller.account.signedOutTitle')}
          body={t('account.signedOut')}
        >
          <Button title={t('account.signIn')} paper onPress={() => router.push('/sign-in')} />
        </BlueprintPanel>
        <AppSettings />
      </ScrollView>
    );
  }

  const phoneVerified = Boolean(user.phone && user.phone_confirmed_at);
  const provider = user.app_metadata.provider;
  const trimmed = name.trim();
  const initials = initialsOf(savedName);

  const saveName = async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed || null })
      .eq('id', user.id);
    setBusy(false);
    if (error) {
      setMessage({ text: t('auth.errors.generic'), error: true });
    } else {
      setSavedName(trimmed);
      setMessage({ text: t('account.saved'), error: false });
    }
  };

  /** Pull to refresh: the session (phone status), the name and the agent card from the server. */
  const refresh = async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const [saved] = await Promise.all([loadDisplayName(user.id), supabase.auth.refreshSession()]);
      setName(saved);
      setSavedName(saved);
      setReloadKey((key) => key + 1);
    } catch {
      // Offline: what is shown stays.
    } finally {
      setRefreshing(false);
    }
  };

  const removeAccount = async () => {
    setDeleting(true);
    setMessage(null);
    try {
      await deleteAccount();
      Alert.alert(t('account.deleted'));
    } catch {
      setMessage({ text: t('account.deleteFailed'), error: true });
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(t('account.deleteTitle'), t('account.deleteBody'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('account.deleteConfirm'),
        style: 'destructive',
        onPress: () => void removeAccount(),
      },
    ]);

  const confirmSignOut = () =>
    Alert.alert(t('account.signOutTitle'), undefined, [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('account.signOut'),
        style: 'destructive',
        onPress: () => {
          signOut().catch((cause: unknown) =>
            setMessage({ text: t(`auth.errors.${authErrorKey(cause)}`), error: true }),
          );
        },
      },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <View style={[styles.card, styles.profile, { backgroundColor: colors.surface }]}>
        <View style={[styles.avatar, { backgroundColor: colors.ink }]}>
          {initials ? (
            <Text style={[styles.avatarText, { color: colors.onInk }]}>{initials}</Text>
          ) : (
            <Icon name="person" size={24} color={colors.onInk} />
          )}
        </View>
        <View style={styles.grow}>
          <Text
            style={[styles.name, { color: savedName ? colors.text : colors.textMuted }]}
            numberOfLines={1}
          >
            {savedName || t('seller.account.noName')}
          </Text>
          {phoneVerified ? (
            <View style={styles.phoneRow}>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {formatMongolianPhone(user.phone ?? '')}
              </Text>
              <View style={[styles.verified, { backgroundColor: colors.successSoft }]}>
                <Icon name="verified" size={12} color={colors.success} />
                <Text style={[styles.verifiedText, { color: colors.onSuccessSoft }]}>
                  {t('account.phoneVerified')}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.small, { color: colors.textMuted }]}>{t('account.noPhone')}</Text>
          )}
          {isMethod(provider) && (
            <Text style={[styles.small, { color: colors.textSubtle }]}>
              {t('account.method', { method: t(`account.methods.${provider}`) })}
            </Text>
          )}
        </View>
      </View>

      {!phoneVerified && (
        <View style={[styles.card, styles.notice, { backgroundColor: colors.warningSoft }]}>
          <View style={styles.noticeHead}>
            <Icon name="warning" size={16} color={colors.warning} />
            <Text style={[styles.body, styles.grow, { color: colors.onWarningSoft }]}>
              {t('account.phoneNeeded')}
            </Text>
          </View>
          <Button
            title={t('account.addPhone')}
            icon="phone"
            onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'add-phone' } })}
          />
        </View>
      )}

      <Group title={t('seller.account.profile')}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <TextField
            label={t('account.displayName')}
            value={name}
            onChangeText={(value) => {
              setName(value);
              setMessage(null);
            }}
            placeholder={t('account.displayNamePlaceholder')}
            maxLength={80}
            textContentType="name"
            autoComplete="name"
          />
          <Button
            title={t('account.save')}
            variant="secondary"
            onPress={() => void saveName()}
            disabled={busy || trimmed === savedName}
          />
          {message && (
            <Text style={[styles.body, { color: message.error ? colors.danger : colors.success }]}>
              {message.text}
            </Text>
          )}
        </View>
      </Group>

      <AgentSection userId={user.id} reloadKey={reloadKey} />

      <AppSettings />

      {/* Account actions last, sign-out right above deletion. */}
      <Button
        title={t('account.signOut')}
        icon="logout"
        variant="outline"
        onPress={confirmSignOut}
        disabled={deleting}
        style={styles.signOut}
      />
      <Pressable
        accessibilityRole="button"
        onPress={confirmDelete}
        disabled={deleting}
        style={({ pressed }) => [styles.deleteRow, { opacity: pressed || deleting ? 0.6 : 1 }]}
      >
        {deleting ? <ActivityIndicator /> : <Icon name="trash" size={16} color={colors.danger} />}
        <Text style={[styles.body, { color: colors.danger }]}>
          {deleting ? t('account.deleting') : t('account.deleteAccount')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/** A labelled group of cards ("ПРОФАЙЛ", "ТОХИРГОО"). */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.group}>
      <Text style={[styles.eyebrow, { color: colors.textMuted }]} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function SettingRow({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.setting}>
      <View style={styles.settingHead}>
        <Icon name={icon} size={16} color={colors.brand} />
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

/** A row that opens a page (icon, label, chevron). */
function LinkRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.row, styles.linkRow, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={16} color={colors.brand} />
      <Text style={[styles.body, styles.grow, { color: colors.text }]}>{label}</Text>
      <Icon name="chevron" size={14} color={colors.textSubtle} />
    </Pressable>
  );
}

/** Light/dark mode, the app language, the legal pages and the RoomPlan test screen. */
function AppSettings() {
  const { t, locale, setLocale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const theme = useThemePreference();
  return (
    <>
      <Group title={t('seller.account.settings')}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <SettingRow icon="contrast" label={t('theme.label')}>
            <Segmented
              accessibilityLabel={t('theme.label')}
              segments={THEME_PREFERENCES.map((option) => ({
                value: option,
                label: t(`theme.${option}`),
              }))}
              value={theme}
              onChange={setThemePreference}
            />
          </SettingRow>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingRow icon="globe" label={t('language.label')}>
            <Segmented
              accessibilityLabel={t('language.label')}
              segments={LOCALES.map((option) => ({
                value: option,
                label: t(`language.${option}`),
              }))}
              value={locale}
              onChange={setLocale}
            />
          </SettingRow>
        </View>
      </Group>
      <Group title={t('footer.legal')}>
        <View style={[styles.card, styles.linkCard, { backgroundColor: colors.surface }]}>
          <LinkRow
            icon="document"
            label={t('footer.terms')}
            onPress={() => openSitePage('terms', locale)}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <LinkRow
            icon="privacy"
            label={t('footer.privacy')}
            onPress={() => openSitePage('privacy', locale)}
          />
        </View>
      </Group>
      <Group title={t('seller.account.testing')}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/scan-test')}
          style={({ pressed }) => [
            styles.card,
            styles.row,
            { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Icon name="wrench" size={16} color={colors.brand} />
          <Text style={[styles.body, styles.grow, { color: colors.text }]}>
            {t('listings.scanTest')}
          </Text>
          <Icon name="chevron" size={14} color={colors.textSubtle} />
        </Pressable>
        {/* Temporary: remove with the website's /payments/test (see PROGRESS "Next"). */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/payment-test')}
          style={({ pressed }) => [
            styles.card,
            styles.row,
            { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Icon name="card" size={16} color={colors.brand} />
          <Text style={[styles.body, styles.grow, { color: colors.text }]}>
            {t('payments.testTitle')}
          </Text>
          <Icon name="chevron" size={14} color={colors.textSubtle} />
        </Pressable>
        <VersionLine />
      </Group>
    </>
  );
}

/**
 * App version and which JavaScript is running: the build's own ("built-in") or an over-the-air
 * update with its publish time, so a tester can see that an update arrived.
 */
function VersionLine() {
  const { t } = useI18n();
  const colors = useColors();
  const version = Constants.expoConfig?.version ?? '?';
  const created = !Updates.isEmbeddedLaunch && Updates.createdAt ? Updates.createdAt : null;
  const source = created
    ? t('account.versionUpdate', { date: formatStamp(created) })
    : t('account.versionBuiltIn');
  return (
    <Text style={[styles.small, styles.version, { color: colors.textMuted }]}>
      {t('account.version', { version })} · {source}
    </Text>
  );
}

/** "2026-11-13 14:20" in the phone's time zone (by hand, like the app's other numbers). */
function formatStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.lg, padding: 16, gap: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700' },
  name: { fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.3 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  verifiedText: { fontSize: 12, fontWeight: '700' },
  notice: { gap: 12 },
  noticeHead: { flexDirection: 'row', gap: 8 },
  group: { gap: 8 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, marginLeft: 4 },
  setting: { gap: 10 },
  settingHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkCard: { paddingVertical: 4, gap: 0 },
  linkRow: { paddingVertical: 12 },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  grow: { flex: 1 },
  signOut: { marginTop: 8 },
  version: { textAlign: 'center', marginTop: 4 },
  deleteRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
});
