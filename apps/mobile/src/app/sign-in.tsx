import { SignInForm, type PhoneMode } from '@bairmair/native-auth';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

/**
 * Phone sign-in (primary), plus Apple and Google when they are enabled in the project.
 * With `?mode=add-phone` a signed-in Apple/Google user adds a phone number instead.
 */
export default function SignInScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode: PhoneMode = modeParam === 'add-phone' ? 'add-phone' : 'sign-in';
  const { t } = useI18n();
  const router = useRouter();
  return (
    <>
      <Stack.Screen
        options={{ title: mode === 'add-phone' ? t('account.addPhone') : t('auth.title') }}
      />
      <SignInForm
        mode={mode}
        onCodeSent={(phone) => router.push({ pathname: '/verify', params: { phone, mode } })}
        // Back to the screen that asked for sign-in (account, a listing, saved listings).
        onSignedIn={() => router.back()}
      />
    </>
  );
}
