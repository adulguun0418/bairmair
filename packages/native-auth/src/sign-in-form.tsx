import { authErrorKey, normalizeMongolianPhone } from '@bairmair/browse';
import { Button } from '@bairmair/native-ui/button';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Text } from '@bairmair/native-ui/text';
import { TextField } from '@bairmair/native-ui/text-field';
import { useColors } from '@bairmair/native-ui/theme';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { signInWithApple, signInWithGoogle, type PhoneMode, type SignInResult } from './actions';
import { useAuth } from './auth-provider';
import { openSitePage } from './site-pages';
import { useSendCode } from './use-send-code';

/**
 * Phone sign-in (primary), plus Apple and Google when they are enabled in the project.
 * In `add-phone` mode a signed-in Apple/Google user adds a phone number instead.
 *
 * Navigation is the app's: `onCodeSent` opens its code screen (`VerifyForm`), `onSignedIn`
 * returns to whatever asked for sign-in. `intro` replaces the default line at the top.
 */
export function SignInForm({
  mode,
  onCodeSent,
  onSignedIn,
  intro,
}: {
  mode: PhoneMode;
  onCodeSent: (phone: string) => void;
  onSignedIn: () => void;
  intro?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const scheme = useColorScheme();
  const { providers, config } = useAuth();

  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  // Captcha only when Supabase asks for it (see useSendCode).
  const code = useSendCode(mode, onCodeSent);

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
      if ((await signIn()) === 'signed-in') onSignedIn();
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
      {intro ?? (
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {mode === 'add-phone' ? t('account.phoneNeeded') : t('auth.intro')}
        </Text>
      )}

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
              onPress={() => void runProvider(() => signInWithApple(config.client))}
            />
          )}
          {providers.google && (
            <Button
              title={t('auth.google')}
              variant="secondary"
              disabled={busy}
              onPress={() => void runProvider(() => signInWithGoogle(config.client))}
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
            onPress={() => openSitePage(config.siteUrl, 'terms', locale)}
          >
            {t('auth.consentTerms')}
          </Text>
          {t('auth.consentMiddle')}
          <Text
            accessibilityRole="link"
            style={[styles.consentLink, { color: colors.text }]}
            onPress={() => openSitePage(config.siteUrl, 'privacy', locale)}
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
