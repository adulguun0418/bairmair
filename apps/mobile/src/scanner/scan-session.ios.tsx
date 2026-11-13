import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { ExportType, RoomPlanView, useRoomPlanView } from 'expo-roomplan';
import { useReducer, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { deviceFacts } from './device';
import { initialScanState, scanReducer, type NativeStatus, type ScanError } from './scan-state';
import { newScanId } from './scan-meta';
import type { ScanSessionProps } from './scan-session.types';
import { saveExport } from './storage';

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
      case 'save':
        return t('scan.errorSave');
      default:
        return t('scan.errorUnknown');
    }
  };

  const bottom = { paddingBottom: insets.bottom + 16 };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <RoomPlanView {...viewProps} style={StyleSheet.absoluteFill} />

      {state.phase === 'intro' && (
        <View style={[styles.sheet, bottom]}>
          <Text style={styles.title}>{t('scan.introTitle')}</Text>
          <Text style={styles.body}>1. {t('scan.step1')}</Text>
          <Text style={styles.body}>2. {t('scan.step2')}</Text>
          <Text style={styles.body}>3. {t('scan.step3')}</Text>
          <Text style={styles.warning}>{t('scan.unsavedWarning')}</Text>
          <Button title={t('scan.start')} onPress={start} />
          <Button title={t('scan.cancel')} variant="secondary" onPress={close} />
        </View>
      )}

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
        <View style={[styles.sheet, bottom]}>
          <Text style={styles.title}>{t('scan.errorTitle')}</Text>
          <Text style={styles.body}>{errorText(state.error)}</Text>
          {state.error?.message ? <Text style={styles.detail}>{state.error.message}</Text> : null}
          {state.error?.kind === 'camera' && (
            <Button title={t('scan.openSettings')} onPress={() => void Linking.openSettings()} />
          )}
          <Button title={t('scan.close')} variant="secondary" onPress={close} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 12,
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: 'rgba(20, 22, 25, 0.94)',
  },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  body: { color: '#e9ecef', fontSize: 16, lineHeight: 22 },
  warning: { color: '#ffc078', fontSize: 15, lineHeight: 21 },
  detail: { color: '#adb5bd', fontSize: 13, fontFamily: 'Menlo' },
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
