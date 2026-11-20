import { VerifyForm } from '@bairmair/native-auth';
import { useLocalSearchParams, useRouter } from 'expo-router';

/** The SMS code; on success, back past sign-in to whatever asked for it. */
export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const router = useRouter();
  return <VerifyForm phone={phone} mode="sign-in" onVerified={() => router.dismiss(2)} />;
}
