import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { attachScannedRoom } from '@/listings/listings';
import { useBestFix } from '@/listings/location';
import { ScanSession } from '@/scanner/scan-session';

/**
 * Scans the apartment for one listing. The phone's position is watched during the scan (for the
 * "scanned on-site" badge). The saved scan becomes the listing's scan, then the seller reviews
 * its rooms.
 */
export default function ListingScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const location = useBestFix();

  const attach = async (scannerId: string) => {
    const result = await attachScannedRoom(id, scannerId, location.current);
    if (result.ok) {
      router.replace({ pathname: '/listings/[id]/rooms', params: { id, flow: '1' } });
      return;
    }
    Alert.alert(
      t('listingScan.attachFailedTitle'),
      t(`listingScan.attachFailed.${result.reason}`),
      [{ text: t('listingScan.ok'), onPress: () => router.back() }],
    );
  };

  return (
    <ScanSession onSaved={(scannerId) => void attach(scannerId)} onCancel={() => router.back()} />
  );
}
