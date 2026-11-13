import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { sendPhoneCode, verifyPhoneCode, type PhoneMode } from '@/auth/actions';
import { authErrorKey } from '@/auth/errors';
import { formatMongolianPhone } from '@/auth/phone';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/text-field';
import { useColors } from '@/ui/theme';

const CODE_LENGTH = 6;
/** Matches `[auth.sms] max_frequency` in supabase/config.toml. */
const RESEND_SECONDS = 60;

/** Second step of phone sign-in (or adding a phone): enter the SMS code. */
export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone: string; mode?: string }>();
  const phone = params.phone;
  const mode: PhoneMode = params.mode === 'add-phone' ? 'add-phone' : 'sign-in';
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const submit = async (value: string) => {
    if (value.length !== CODE_LENGTH || busy) return;
    setError(null);
    setBusy(true);
    try {
      await verifyPhoneCode(phone, value, mode);
      // Close this screen and sign-in: back to whatever asked for it.
      router.dismiss(2);
    } catch (cause) {
      setError(t(`auth.errors.${authErrorKey(cause)}`));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const onChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void submit(digits);
  };

  const resend = async () => {
    setError(null);
    setBusy(true);
    try {
      await sendPhoneCode(phone, mode);
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
    } catch (cause) {
      setError(t(`auth.errors.${authErrorKey(cause)}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: t('auth.codeTitle') }} />
      <Text style={[styles.body, { color: colors.textMuted }]}>
        {t('auth.codeSent', { phone: formatMongolianPhone(phone) })}
      </Text>
      <TextField
        label={t('auth.codeLabel')}
        value={code}
        onChangeText={onChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={CODE_LENGTH}
        style={styles.code}
        autoFocus
      />
      {error && <Text style={[styles.body, { color: colors.danger }]}>{error}</Text>}
      <Button
        title={t('auth.verify')}
        onPress={() => void submit(code)}
        disabled={busy || code.length !== CODE_LENGTH}
      />
      <Button
        title={secondsLeft > 0 ? t('auth.resendIn', { seconds: secondsLeft }) : t('auth.resend')}
        variant="secondary"
        onPress={() => void resend()}
        disabled={busy || secondsLeft > 0}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  body: { fontSize: 16, lineHeight: 22 },
  code: { fontSize: 24, letterSpacing: 8, fontVariant: ['tabular-nums'] },
});
