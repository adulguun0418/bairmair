import { useRouter } from 'expo-router';
import { ScanSession } from '@bairmair/scanner/native';

export default function ScanScreen() {
  const router = useRouter();
  return (
    <ScanSession
      onSaved={(id) => router.replace({ pathname: '/scans/[id]', params: { id } })}
      onCancel={() => router.back()}
    />
  );
}
