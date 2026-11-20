import { sharedScanPath } from '@bairmair/db';
import { formatArea, roomDisplayName } from '@bairmair/i18n';
import { Button } from '@bairmair/native-ui/button';
import { useI18n } from '@bairmair/native-ui/i18n';
import { ScanFloorPlan } from '@bairmair/native-ui/scan-floor-plan';
import { Text } from '@bairmair/native-ui/text';
import { radius, useColors } from '@bairmair/native-ui/theme';
import { computeMetrics, type RoomModelV1 } from '@bairmair/room-model';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { env } from '@/lib/env';
import {
  deleteServerScan,
  fetchScan,
  fetchScanModel,
  renameScan,
  scanArea,
  setLinkEnabled,
  type ServerScan,
} from '@/scans/server-scans';
import { deleteLocalCopyOf } from '@/uploads/uploads';

type Load =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'error' }
  | { state: 'loaded'; scan: ServerScan; model: RoomModelV1 | null };

/** One scan on the server: plan and rooms, its link (share, on/off), 3D, rename, delete. */
export default function ScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const scan = await fetchScan(id);
      if (!scan) {
        setLoad({ state: 'missing' });
        return;
      }
      const model = scan.status === 'ready' ? await fetchScanModel(scan) : null;
      setLoad({ state: 'loaded', scan, model });
    } catch {
      setLoad((current) => (current.state === 'loaded' ? current : { state: 'error' }));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const metrics = useMemo(
    () => (load.state === 'loaded' && load.model ? computeMetrics(load.model) : null),
    [load],
  );

  if (load.state !== 'loaded') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {load.state === 'loading' ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text style={[styles.body, { color: colors.text }]}>
              {load.state === 'missing'
                ? t('scanApp.detail.notFound')
                : t('scanApp.detail.loadFailed')}
            </Text>
            {load.state === 'error' && (
              <Button title={t('scanApp.retry')} onPress={() => void reload()} />
            )}
          </>
        )}
      </View>
    );
  }

  const { scan, model } = load;
  const title = scan.title ?? t('scanApp.untitled');
  const area = scanArea(scan);
  const url = `${env.siteUrl}${sharedScanPath(scan.share_slug, locale)}`;

  const share = () =>
    void Share.share({
      message: t('scanApp.detail.shareMessage', {
        title,
        area: area === null ? '' : formatArea(area, locale),
      }),
      url,
    });

  const toggleLink = async (enabled: boolean) => {
    setLoad({ ...load, scan: { ...scan, link_enabled: enabled } });
    try {
      await setLinkEnabled(scan.id, enabled);
    } catch {
      setLoad({ ...load, scan });
      Alert.alert(t('scanApp.detail.linkFailed'));
    }
  };

  const rename = () =>
    Alert.prompt(
      t('scanApp.detail.renameTitle'),
      undefined,
      [
        { text: t('account.cancel'), style: 'cancel' },
        {
          text: t('account.save'),
          onPress: (value?: string) => {
            const next = value?.trim().slice(0, 80) || null;
            setLoad({ ...load, scan: { ...scan, title: next } });
            renameScan(scan.id, value ?? '').catch(() => {
              setLoad({ ...load, scan });
              Alert.alert(t('scanApp.detail.renameFailed'));
            });
          },
        },
      ],
      'plain-text',
      scan.title ?? '',
    );

  const remove = () =>
    Alert.alert(t('scanApp.detail.deleteTitle'), t('scanApp.detail.deleteBody'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('scanResult.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          deleteServerScan(scan)
            .then(() => {
              deleteLocalCopyOf(scan.id);
              router.back();
            })
            .catch(() => Alert.alert(t('scanApp.detail.deleteFailed')))
            .finally(() => setBusy(false));
        },
      },
    ]);

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void reload().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Button
              title={t('scanApp.detail.rename')}
              variant="outline"
              size="small"
              onPress={rename}
            />
          ),
        }}
      />

      {scan.status === 'uploaded' && (
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {t('scanApp.detail.processingNote')}
        </Text>
      )}
      {scan.status === 'failed' && (
        <Text style={[styles.body, { color: colors.danger }]}>
          {t('scanApp.detail.failedNote')}
        </Text>
      )}

      {model && metrics && (
        <>
          <ScanFloorPlan model={model} />
          <View style={card}>
            {model.rooms.map((room, index) => (
              <View key={room.id} style={styles.line}>
                <Text style={[styles.body, { color: colors.text }]}>
                  {roomDisplayName(t, room)}
                </Text>
                <Text style={[styles.body, { color: colors.text }]}>
                  {formatArea(metrics.rooms[index]?.areaM2 ?? 0, locale)}
                </Text>
              </View>
            ))}
            <View style={[styles.line, styles.total, { borderColor: colors.border }]}>
              <Text style={[styles.body, styles.bold, { color: colors.text }]}>
                {t('viewer.totalArea')}
              </Text>
              <Text style={[styles.body, styles.bold, { color: colors.text }]}>
                {formatArea(metrics.totalAreaM2, locale)}
              </Text>
            </View>
            <Text style={[styles.small, { color: colors.textMuted }]}>
              {t('viewer.approximateScanned')}
            </Text>
          </View>
        </>
      )}

      {scan.status === 'ready' && (
        <View style={card}>
          <Text style={[styles.heading, { color: colors.text }]}>{t('scanApp.detail.link')}</Text>
          <Text selectable style={[styles.mono, { color: colors.textMuted }]}>
            {url}
          </Text>
          <View style={styles.line}>
            <Text style={[styles.body, { color: colors.text }]}>{t('scanApp.detail.linkOn')}</Text>
            <Switch value={scan.link_enabled} onValueChange={(value) => void toggleLink(value)} />
          </View>
          {scan.link_enabled ? (
            <>
              <Button title={t('scanApp.detail.share')} icon="share" onPress={share} />
              <Button
                title={t('scanApp.detail.open3d')}
                icon="view3d"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/scans/[id]/model',
                    params: { id: scan.id, slug: scan.share_slug },
                  })
                }
              />
            </>
          ) : (
            <Text style={[styles.small, { color: colors.textMuted }]}>
              {t('scanApp.detail.linkOffNote')}
            </Text>
          )}
        </View>
      )}

      <Button
        title={t('scanApp.detail.delete')}
        icon="trash"
        variant="outline"
        disabled={busy}
        onPress={remove}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  card: { borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  total: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  heading: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  bold: { fontWeight: '700' },
  small: { fontSize: 14, lineHeight: 20 },
  mono: { fontSize: 13, fontFamily: 'Menlo' },
});
