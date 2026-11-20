import { VerifyForm, type PhoneMode } from '@bairmair/native-auth';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

/** Second step of phone sign-in (or adding a phone): enter the SMS code. */
export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone: string; mode?: string }>();
  const mode: PhoneMode = params.mode === 'add-phone' ? 'add-phone' : 'sign-in';
  const { t } = useI18n();
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: t('auth.codeTitle') }} />
      <VerifyForm
        phone={params.phone}
        mode={mode}
        // Close this screen and sign-in: back to whatever asked for it.
        onVerified={() => router.dismiss(2)}
      />
    </>
  );
}
