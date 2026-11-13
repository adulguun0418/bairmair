import * as AppleAuthentication from 'expo-apple-authentication';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import {
  sendPhoneCode,
  signInWithApple,
  signInWithGoogle,
  type PhoneMode,
  type SignInResult,
} from '@/auth/actions';
import { useAuth } from '@/auth/auth-provider';
import { authErrorKey } from '@/auth/errors';
import { normalizeMongolianPhone } from '@/auth/phone';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/text-field';
import { useColors } from '@/ui/theme';

/**
 * Phone sign-in (primary), plus Apple and Google when they are enabled in the project.
 * With `?mode=add-phone` a signed-in Apple/Google user adds a phone number instead.
 */
export default function SignInScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode: PhoneMode = modeParam === 'add-phone' ? 'add-phone' : 'sign-in';
  const { t } = useI18n();
  const colors = useColors();
  const scheme = useColorScheme();
  const router = useRouter();
  const { providers } = useAuth();

  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const submitPhone = async () => {
    const phone = normalizeMongolianPhone(input);
    if (!phone) {
      setInputError(t('auth.invalidPhone'));
      return;
    }
    setInputError(null);
    setError(null);
    setBusy(true);
    try {
      await sendPhoneCode(phone, mode);
      router.push({ pathname: '/verify', params: { phone, mode } });
    } catch (cause) {
      setError(t(`auth.errors.${authErrorKey(cause)}`));
    } finally {
      setBusy(false);
    }
  };

  const runProvider = async (signIn: () => Promise<SignInResult>) => {
    setError(null);
    setBusy(true);
    try {
      // Back to the screen that asked for sign-in (account, a listing, saved listings).
      if ((await signIn()) === 'signed-in') router.back();
    } catch (cause) {
      setError(t(`auth.errors.${authErrorKey(cause)}`));
    } finally {
      setBusy(false);
    }
  };

  const showProviders =
    mode === 'sign-in' && (providers.google || (appleAvailable && providers.apple));

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{ title: mode === 'add-phone' ? t('account.addPhone') : t('auth.title') }}
      />
      <Text style={[styles.body, { color: colors.textMuted }]}>
        {mode === 'add-phone' ? t('account.phoneNeeded') : t('auth.intro')}
      </Text>

      <TextField
        label={t('auth.phoneLabel')}
        prefix="+976"
        value={input}
        onChangeText={setInput}
        placeholder={t('auth.phonePlaceholder')}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={16}
        returnKeyType="done"
        onSubmitEditing={() => void submitPhone()}
        error={inputError}
        autoFocus
      />
      <Button title={t('auth.sendCode')} onPress={() => void submitPhone()} disabled={busy} />

      {error && <Text style={[styles.body, { color: colors.danger }]}>{error}</Text>}

      {showProviders && (
        <>
          <View style={styles.divider}>
            <View style={[styles.rule, { backgroundColor: colors.border }]} />
            <Text style={{ color: colors.textMuted }}>{t('auth.or')}</Text>
            <View style={[styles.rule, { backgroundColor: colors.border }]} />
          </View>
          {appleAvailable && providers.apple && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={12}
              style={styles.apple}
              onPress={() => void runProvider(signInWithApple)}
            />
          )}
          {providers.google && (
            <Button
              title={t('auth.google')}
              variant="secondary"
              disabled={busy}
              onPress={() => void runProvider(signInWithGoogle)}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  body: { fontSize: 16, lineHeight: 22 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  apple: { height: 48 },
});
