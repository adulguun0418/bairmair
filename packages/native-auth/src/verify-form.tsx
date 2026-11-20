import { authErrorKey, formatMongolianPhone } from '@bairmair/browse';
import { Button } from '@bairmair/native-ui/button';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Text } from '@bairmair/native-ui/text';
import { TextField } from '@bairmair/native-ui/text-field';
import { useColors } from '@bairmair/native-ui/theme';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { verifyPhoneCode, type PhoneMode } from './actions';
import { useAuth } from './auth-provider';
import { useSendCode } from './use-send-code';

const CODE_LENGTH = 6;
/** Matches `[auth.sms] max_frequency` in supabase/config.toml. */
const RESEND_SECONDS = 60;

/**
 * Second step of phone sign-in (or adding a phone): enter the SMS code. `onVerified` is the
 * app's navigation back to whatever asked for sign-in.
 */
export function VerifyForm({
  phone,
  mode,
  onVerified,
}: {
  phone: string;
  mode: PhoneMode;
  onVerified: () => void;
}) {
  const { t } = useI18n();
  const colors = useColors();
  const { config } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  // "Send again", with captcha only when Supabase asks for it (see useSendCode).
  const resendCode = useSendCode(mode, () => setResendAt(Date.now() + RESEND_SECONDS * 1000));

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
      await verifyPhoneCode(config.client, phone, value, mode);
      onVerified();
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
    await resendCode.send(phone);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
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
      {(error ?? resendCode.error) && (
        <Text style={[styles.body, { color: colors.danger }]}>{error ?? resendCode.error}</Text>
      )}
      <Button
        title={t('auth.verify')}
        onPress={() => void submit(code)}
        disabled={busy || code.length !== CODE_LENGTH}
      />
      <Button
        title={secondsLeft > 0 ? t('auth.resendIn', { seconds: secondsLeft }) : t('auth.resend')}
        variant="secondary"
        onPress={() => void resend()}
        disabled={busy || resendCode.busy || secondsLeft > 0}
      />
      {resendCode.captcha}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  body: { fontSize: 16, lineHeight: 22 },
  code: { fontSize: 24, letterSpacing: 8, fontVariant: ['tabular-nums'] },
});
