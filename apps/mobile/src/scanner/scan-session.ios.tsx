import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { ExportType, RoomPlanView, useRoomPlanView } from 'expo-roomplan';
import { useReducer, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { deviceFacts } from './device';
import { ScanFailure, ScanIntro } from './scan-intro';
import { initialScanState, scanReducer, type NativeStatus, type ScanError } from './scan-state';
import { newScanId } from './scan-meta';
import type { ScanSessionProps } from './scan-session.types';
import { saveExport } from './storage';
import { Text } from '@/ui/text';

/**
 * One whole-apartment scan with expo-roomplan's embedded `RoomPlanView` and our own localized
 * controls. The screen mounts a fresh native view per scan, because the view never clears the
 * rooms it has captured.
 */
export function ScanSession({ onSaved, onCancel }: ScanSessionProps) {
  useKeepAwake();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [scanId] = useState(() => newScanId());
  const [state, dispatch] = useReducer(scanReducer, initialScanState);

  const { viewProps, controls } = useRoomPlanView({
    scanName: scanId,
    exportType: ExportType.Parametric,
    exportOnFinish: true,
    sendFileLoc: true,
    onStatus: ({ nativeEvent }) =>
      dispatch({
        type: 'status',
        status: String(nativeEvent.status) as NativeStatus,
        message: nativeEvent.errorMessage,
      }),
    onExported: ({ nativeEvent }) => void save(nativeEvent),
  });

  async function save(exported: { jsonUrl?: string; scanUrl?: string }) {
    if (!exported.jsonUrl) {
      dispatch({ type: 'saveFailed', message: 'The export has no JSON file.' });
      return;
    }
    dispatch({ type: 'exported' });
    try {
      await saveExport(
        {
          id: scanId,
          createdAt: new Date().toISOString(),
          device: { modelId: deviceFacts.modelId, osVersion: deviceFacts.osVersion },
        },
        { jsonUrl: exported.jsonUrl, scanUrl: exported.scanUrl },
      );
      // "Finish" already stopped the capture; the native view is released with this screen.
      onSaved(scanId);
    } catch (error) {
      dispatch({
        type: 'saveFailed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const start = () => {
    dispatch({ type: 'start' });
    controls.start();
  };
  const finish = () => {
    dispatch({ type: 'finish' });
    controls.finishScan();
  };
  const close = () => {
    controls.cancel();
    onCancel();
  };
  const confirmCancel = () => {
    if (state.phase === 'intro') {
      close();
      return;
    }
    Alert.alert(t('scan.discardTitle'), t('scan.discardBody'), [
      { text: t('scan.keepScanning'), style: 'cancel' },
      { text: t('scan.discard'), style: 'destructive', onPress: close },
    ]);
  };

  const errorText = (error: ScanError | null): string => {
    switch (error?.kind) {
      case 'not-supported':
        return t('scan.errorNotSupported');
      case 'camera':
        return t('scan.errorCamera');
      case 'too-large':
        return t('scan.errorTooLarge');
      case 'too-hot':
        return t('scan.errorTooHot');
      case 'tracking':
        return t('scan.errorTracking');
      case 'stopped':
        return t('scan.errorStopped');
      case 'save':
        return t('scan.errorSave');
      default:
        return t('scan.errorUnknown');
    }
  };

  const bottom = { paddingBottom: insets.bottom + 16 };

  return (
    <View style={styles.root}>
      {/* Dark text on the paper intro and error pages, light over the camera. */}
      <StatusBar style={state.phase === 'intro' || state.phase === 'failed' ? 'dark' : 'light'} />
      <RoomPlanView {...viewProps} style={StyleSheet.absoluteFill} />

      {state.phase === 'intro' && <ScanIntro onStart={start} onCancel={close} />}

      {state.phase === 'scanning' && (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Button title={t('scan.cancel')} variant="secondary" onPress={confirmCancel} />
          </View>
          <View style={[styles.bottomBar, bottom]}>
            <Button title={t('scan.finish')} onPress={finish} />
          </View>
        </>
      )}

      {(state.phase === 'building' || state.phase === 'saving') && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.overlayText}>
            {state.phase === 'building' ? t('scan.building') : t('scan.saving')}
          </Text>
        </View>
      )}

      {state.phase === 'failed' && (
        <ScanFailure
          message={errorText(state.error)}
          detail={state.error?.message ?? null}
          onClose={close}
          onOpenSettings={
            state.error?.kind === 'camera' ? () => void Linking.openSettings() : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomBar: { position: 'absolute', left: 16, right: 16, bottom: 0, gap: 12 },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  overlayText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
});
