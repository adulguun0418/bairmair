import * as AppleAuthentication from 'expo-apple-authentication';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import {
  signInWithApple,
  signInWithGoogle,
  type PhoneMode,
  type SignInResult,
} from '@/auth/actions';
import { useAuth } from '@/auth/auth-provider';
import { useSendCode } from '@/auth/use-send-code';
import { authErrorKey, normalizeMongolianPhone } from '@bairmair/browse';
import { useI18n } from '@bairmair/native-ui/i18n';
import { openSitePage } from '@/lib/site-pages';
import { Button } from '@bairmair/native-ui/button';
import { TextField } from '@/ui/text-field';
import { useColors } from '@bairmair/native-ui/theme';
import { Text } from '@bairmair/native-ui/text';

/**
 * Phone sign-in (primary), plus Apple and Google when they are enabled in the project.
 * With `?mode=add-phone` a signed-in Apple/Google user adds a phone number instead.
 */
export default function SignInScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode: PhoneMode = modeParam === 'add-phone' ? 'add-phone' : 'sign-in';
  const { t, locale } = useI18n();
  const colors = useColors();
  const scheme = useColorScheme();
  const router = useRouter();
  const { providers } = useAuth();

  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  // Captcha only when Supabase asks for it (see useSendCode).
  const code = useSendCode(mode, (phone) =>
    router.push({ pathname: '/verify', params: { phone, mode } }),
  );

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
    await code.send(phone);
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
      {code.captcha}
      <Button
        title={t('auth.sendCode')}
        onPress={() => void submitPhone()}
        disabled={busy || code.busy}
      />

      {(code.error ?? error) && (
        <Text style={[styles.body, { color: colors.danger }]}>{code.error ?? error}</Text>
      )}

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

      {mode === 'sign-in' && (
        <Text style={[styles.consent, { color: colors.textMuted }]}>
          {t('auth.consentBefore')}
          <Text
            accessibilityRole="link"
            style={[styles.consentLink, { color: colors.text }]}
            onPress={() => openSitePage('terms', locale)}
          >
            {t('auth.consentTerms')}
          </Text>
          {t('auth.consentMiddle')}
          <Text
            accessibilityRole="link"
            style={[styles.consentLink, { color: colors.text }]}
            onPress={() => openSitePage('privacy', locale)}
          >
            {t('auth.consentPrivacy')}
          </Text>
          {t('auth.consentAfter')}
        </Text>
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
  consent: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  consentLink: { fontWeight: '600', textDecorationLine: 'underline' },
});
