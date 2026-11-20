import { USER_SCAN_FREE_LIMIT } from '@bairmair/db';
import { formatArea } from '@bairmair/i18n';
import { useAuth } from '@bairmair/native-auth';
import { BlueprintPanel } from '@bairmair/native-ui/blueprint-panel';
import { Button } from '@bairmair/native-ui/button';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Icon } from '@bairmair/native-ui/icon';
import { Text } from '@bairmair/native-ui/text';
import { radius, useColors } from '@bairmair/native-ui/theme';
import { canStartScan, formatScanTime, supportMessage } from '@bairmair/scanner';
import { scanSupport } from '@bairmair/scanner/native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { env } from '@/lib/env';
import { fetchMyScans, scanArea, type ServerScan } from '@/scans/server-scans';
import { pendingLocalCount, uploadStatus } from '@/uploads/upload-model';
import { retryUpload, useLocalScans } from '@/uploads/uploads';

/**
 * "Миний сканууд": the free-scan count and "Шинэ скан", scans still on their way to the server,
 * and the scans on the server (each with its link). An iPhone without LiDAR is sent to the
 * website instead; signed out, the first step is signing in.
 */
export default function HomeScreen() {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const { session, ready } = useAuth();
  const local = useLocalScans();
  const userId = session?.user.id ?? null;
  const [server, setServer] = useState<ServerScan[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const mine = local.filter((entry) => entry.record?.ownerId === userId);
  const records = mine.flatMap((entry) => (entry.record ? [entry.record] : []));
  const drafts = local.filter((entry) => entry.record === null);
  const pending = mine.filter((entry) => entry.record && entry.record.step !== 'done');
  // Reload the server list whenever an upload finishes.
  const doneCount = records.filter((record) => record.step === 'done').length;

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setServer(await fetchMyScans(userId));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // `doneCount` re-runs this when an upload completes while the screen is open.
    }, [load, doneCount]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('account.title')}
            hitSlop={12}
            onPress={() => router.push('/account')}
          >
            <Icon name="person" size={20} color={colors.text} />
          </Pressable>
        ),
      }}
    />
  );

  const page = (children: ReactNode) => (
    <>
      {header}
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          userId ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </>
  );

  // No LiDAR (or iOS too old): this phone cannot scan; the marketplace is on the website.
  if (!canStartScan(scanSupport)) {
    return page(
      <BlueprintPanel
        icon="warning"
        title={t('scanApp.cannotScanTitle')}
        body={`${supportMessage(t, scanSupport)} ${t('scanApp.toWebsiteBody')}`}
      >
        <Button
          title={t('scanApp.toWebsite')}
          icon="globe"
          paper
          onPress={() => void Linking.openURL(env.siteUrl)}
        />
      </BlueprintPanel>,
    );
  }

  if (!ready) {
    return page(<ActivityIndicator style={styles.spinner} />);
  }

  if (!userId) {
    return page(
      <BlueprintPanel
        icon="cube"
        eyebrow={t('scanApp.emptyEyebrow')}
        title={t('scanApp.signInTitle')}
        body={t('scanApp.signInBody')}
      >
        <Button title={t('scanApp.signIn')} paper onPress={() => router.push('/sign-in')} />
      </BlueprintPanel>,
    );
  }

  // Scans still uploading are shown from the phone, not twice.
  const uploading = new Set(pending.map((entry) => entry.record!.remoteId));
  const serverScans = (server ?? []).filter((scan) => !uploading.has(scan.id));
  const kept = (server ?? []).filter((scan) => scan.listing_id === null).length;
  const used = server === null ? null : kept + pendingLocalCount(drafts.length, records, userId);
  const atLimit = used !== null && used >= USER_SCAN_FREE_LIMIT;
  const empty = server !== null && serverScans.length === 0 && pending.length === 0;

  const startScan = () => router.push('/scan');

  return page(
    <>
      {empty && drafts.length === 0 ? (
        <BlueprintPanel
          icon="cube"
          eyebrow={t('scanApp.emptyEyebrow')}
          title={t('scanApp.emptyTitle')}
          body={t('scanApp.emptyBody')}
        >
          <Button title={t('scanApp.newScan')} icon="camera" paper onPress={startScan} />
        </BlueprintPanel>
      ) : atLimit ? (
        <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
          <Text style={[styles.heading, { color: colors.onWarningSoft }]}>
            {t('scanApp.limitTitle')}
          </Text>
          <Text style={[styles.small, { color: colors.onWarningSoft }]}>
            {t('scanApp.limitBody', { limit: USER_SCAN_FREE_LIMIT })}
          </Text>
        </View>
      ) : (
        <Button title={t('scanApp.newScan')} icon="camera" onPress={startScan} />
      )}

      {used !== null && (
        <Text style={[styles.small, styles.center, { color: colors.textMuted }]}>
          {t('scanApp.freeCount', {
            used: Math.min(used, USER_SCAN_FREE_LIMIT),
            limit: USER_SCAN_FREE_LIMIT,
          })}
        </Text>
      )}
      {loadFailed && (
        <Text style={[styles.small, styles.center, { color: colors.danger }]}>
          {t('scanApp.detail.loadFailed')}
        </Text>
      )}

      {(drafts.length > 0 || pending.length > 0 || serverScans.length > 0) && (
        <View style={styles.list}>
          <Text style={[styles.eyebrow, { color: colors.textSubtle }]}>
            {t('scanApp.myScans').toUpperCase()}
          </Text>

          {drafts.map(({ scan }) => (
            <ScanRow
              key={scan.meta.id}
              title={formatScanTime(scan.meta.createdAt) || t('scanApp.untitled')}
              status={t('scanApp.status.draft')}
              tone="warning"
              onPress={() =>
                router.push({ pathname: '/review/[id]', params: { id: scan.meta.id } })
              }
            />
          ))}

          {pending.map(({ scan, record }) => {
            const status = uploadStatus(record!);
            const stopped = status === 'failed' || status === 'limit' || status === 'waiting';
            return (
              <ScanRow
                key={scan.meta.id}
                title={
                  record!.title ?? (formatScanTime(record!.createdAt) || t('scanApp.untitled'))
                }
                status={t(`scanApp.status.${status === 'done' ? 'processing' : status}`)}
                tone={status === 'failed' || status === 'limit' ? 'danger' : 'muted'}
                busy={!stopped}
                action={
                  stopped ? (
                    <Button
                      title={t('scanApp.retry')}
                      size="small"
                      variant="outline"
                      onPress={() => retryUpload(scan.meta.id)}
                    />
                  ) : undefined
                }
              />
            );
          })}

          {serverScans.map((scan) => {
            const area = scanArea(scan);
            const status =
              scan.status === 'uploaded'
                ? t('scanApp.status.processing')
                : scan.status === 'failed'
                  ? t('scanApp.status.failed')
                  : [
                      area === null ? null : formatArea(area, locale),
                      scan.link_enabled ? null : t('scanApp.status.linkOff'),
                    ]
                      .filter(Boolean)
                      .join(' · ');
            return (
              <ScanRow
                key={scan.id}
                title={scan.title ?? (formatScanTime(scan.created_at) || t('scanApp.untitled'))}
                status={status}
                tone={scan.status === 'failed' ? 'danger' : 'muted'}
                onPress={() => router.push({ pathname: '/scans/[id]', params: { id: scan.id } })}
              />
            );
          })}
        </View>
      )}
    </>,
  );
}

function ScanRow({
  title,
  status,
  tone,
  busy,
  action,
  onPress,
}: {
  title: string;
  status: string;
  tone: 'muted' | 'warning' | 'danger';
  busy?: boolean;
  action?: ReactNode;
  onPress?: () => void;
}) {
  const colors = useColors();
  const statusColor =
    tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.textMuted;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
        {busy ? <ActivityIndicator /> : <Icon name="cube" size={20} color={colors.brand} />}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {status ? <Text style={[styles.small, { color: statusColor }]}>{status}</Text> : null}
      </View>
      {action ?? (onPress ? <Icon name="chevron" size={16} color={colors.textSubtle} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  spinner: { marginTop: 40 },
  notice: { borderRadius: radius.lg, padding: 16, gap: 6 },
  heading: { fontSize: 17, fontWeight: '700' },
  list: { gap: 10 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1 },
  center: { textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20 },
});
