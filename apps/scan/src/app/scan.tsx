import { ScanSession } from '@bairmair/scanner/native';
import { useRouter } from 'expo-router';
import { refreshLocalScans } from '@/uploads/uploads';

/** The scanner (shared with bairmair); a finished scan opens its review. */
export default function ScanScreen() {
  const router = useRouter();
  return (
    <ScanSession
      onSaved={(id) => {
        refreshLocalScans();
        router.replace({ pathname: '/review/[id]', params: { id } });
      }}
      onCancel={() => router.back()}
    />
  );
}
