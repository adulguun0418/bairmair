import { ScanSession } from '@bairmair/scanner/native';
import { useRouter } from 'expo-router';

/** The scanner (shared with bairmair); a finished scan opens its report. */
export default function ScanScreen() {
  const router = useRouter();
  return (
    <ScanSession
      onSaved={(id) => router.replace({ pathname: '/scans/[id]', params: { id } })}
      onCancel={() => router.back()}
    />
  );
}
