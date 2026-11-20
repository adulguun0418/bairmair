import { Button } from '@bairmair/native-ui/button';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Text } from '@bairmair/native-ui/text';
import { radius, useColors } from '@bairmair/native-ui/theme';
import { formatScanTime, supportMessage } from '@bairmair/scanner';
import { deviceFacts, scanSupport } from '@bairmair/scanner/native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { endConnection, initConnection } from 'expo-iap';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

type StoreState =
  { status: 'checking' } | { status: 'connected' } | { status: 'failed'; message: string };

/**
 * What a tester needs to see that this build works: the phone and its scan support, the running
 * JavaScript (build or update), and whether StoreKit answers (the In-App Purchase module is in
 * the build). Purchases themselves come in step 5.
 */
export default function DiagnosticsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const [store, setStore] = useState<StoreState>({ status: 'checking' });
  // Bumped by "check again"; each value runs the check once.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    initConnection().then(
      (connected) => {
        if (active) {
          setStore(connected ? { status: 'connected' } : { status: 'failed', message: 'false' });
        }
      },
      (error: unknown) => {
        if (active) {
          setStore({
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      active = false;
      void endConnection().catch(() => undefined);
    };
  }, [attempt]);

  const version = Constants.expoConfig?.version ?? '?';
  const created = !Updates.isEmbeddedLaunch && Updates.createdAt ? Updates.createdAt : null;
  const source = created
    ? t('account.versionUpdate', { date: formatScanTime(created.toISOString()) })
    : t('account.versionBuiltIn');

  const supportColor =
    scanSupport.status === 'supported'
      ? colors.success
      : scanSupport.status === 'unverified'
        ? colors.warning
        : colors.danger;
  const storeText =
    store.status === 'checking'
      ? t('scanApp.diagnostics.storeChecking')
      : store.status === 'connected'
        ? t('scanApp.diagnostics.storeConnected')
        : t('scanApp.diagnostics.storeFailed');
  const storeColor =
    store.status === 'connected'
      ? colors.success
      : store.status === 'failed'
        ? colors.danger
        : colors.textMuted;

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const heading = [styles.heading, { color: colors.text }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={card}>
        <Text style={heading}>{t('scanApp.diagnostics.device')}</Text>
        <Text style={[styles.mono, { color: colors.text }]}>
          {Device.modelName ?? '—'} · {deviceFacts.modelId ?? '—'} · iOS{' '}
          {deviceFacts.osVersion ?? '—'}
        </Text>
      </View>

      <View style={card}>
        <Text style={heading}>{t('scanApp.diagnostics.scan')}</Text>
        <Text style={[styles.body, { color: supportColor }]}>{supportMessage(t, scanSupport)}</Text>
      </View>

      <View style={card}>
        <Text style={heading}>{t('scanApp.diagnostics.store')}</Text>
        <Text style={[styles.body, { color: storeColor }]}>{storeText}</Text>
        {store.status === 'failed' && (
          <>
            <Text style={[styles.mono, { color: colors.textMuted }]}>{store.message}</Text>
            <Button
              title={t('scanApp.diagnostics.check')}
              variant="secondary"
              size="small"
              onPress={() => {
                setStore({ status: 'checking' });
                setAttempt((value) => value + 1);
              }}
            />
          </>
        )}
      </View>

      <Text style={[styles.small, { color: colors.textMuted }]}>
        {t('account.version', { version })} · {source}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { borderRadius: radius.lg, padding: 16, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  heading: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  mono: { fontSize: 13, fontFamily: 'Menlo' },
});
