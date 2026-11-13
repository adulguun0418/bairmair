import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { signOut } from '@/auth/actions';
import { useAuth } from '@/auth/auth-provider';
import { authErrorKey } from '@/auth/errors';
import { formatMongolianPhone } from '@/auth/phone';
import { useI18n } from '@/i18n/i18n';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/text-field';
import { useColors } from '@/ui/theme';

const METHODS = ['phone', 'apple', 'google', 'email'] as const;
type Method = (typeof METHODS)[number];

function isMethod(value: unknown): value is Method {
  return typeof value === 'string' && (METHODS as readonly string[]).includes(value);
}

/** Signed out: a way in. Signed in: name, phone status (needed to publish) and sign-out. */
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

  useEffect(() => {
    if (!user) return;
    let active = true;
    void supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!active) return;
        setName(data?.display_name ?? '');
        setSavedName(data?.display_name ?? '');
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

  const text = { color: colors.text };
  const muted = { color: colors.textMuted };

  if (!user) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={[styles.body, muted]}>{t('account.signedOut')}</Text>
        <Button title={t('account.signIn')} onPress={() => router.push('/sign-in')} />
      </ScrollView>
    );
  }

  const phoneVerified = Boolean(user.phone && user.phone_confirmed_at);
  const provider = user.app_metadata.provider;
  const trimmed = name.trim();

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
    >
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.heading, text]}>{t('account.phone')}</Text>
        {phoneVerified ? (
          <View style={styles.line}>
            <Text style={[styles.body, text]}>{formatMongolianPhone(user.phone ?? '')}</Text>
            <Text style={[styles.body, { color: colors.success }]}>
              {t('account.phoneVerified')}
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.body, muted]}>{t('account.noPhone')}</Text>
            <Text style={[styles.body, { color: colors.warning }]}>{t('account.phoneNeeded')}</Text>
            <Button
              title={t('account.addPhone')}
              onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'add-phone' } })}
            />
          </>
        )}
        {isMethod(provider) && (
          <Text style={[styles.small, muted]}>
            {t('account.method', { method: t(`account.methods.${provider}`) })}
          </Text>
        )}
      </View>

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

      <Button title={t('account.signOut')} variant="danger" onPress={confirmSignOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, padding: 16, gap: 10 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
});
