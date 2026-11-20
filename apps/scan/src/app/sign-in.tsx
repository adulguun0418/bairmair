import { SignInForm } from '@bairmair/native-auth';
import { useRouter } from 'expo-router';

/** Phone sign-in (plus Apple when enabled), shared with bairmair. */
export default function SignInScreen() {
  const router = useRouter();
  return (
    <SignInForm
      mode="sign-in"
      onCodeSent={(phone) => router.push({ pathname: '/verify', params: { phone } })}
      onSignedIn={() => router.back()}
    />
  );
}
