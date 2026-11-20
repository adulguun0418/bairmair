import { formatArea, roomDisplayName } from '@bairmair/i18n';
import { useAuth } from '@bairmair/native-auth';
import { Button } from '@bairmair/native-ui/button';
import { useI18n } from '@bairmair/native-ui/i18n';
import { ScanFloorPlan } from '@bairmair/native-ui/scan-floor-plan';
import { Text } from '@bairmair/native-ui/text';
import { TextField } from '@bairmair/native-ui/text-field';
import { radius, useColors } from '@bairmair/native-ui/theme';
import { analyzeExport } from '@bairmair/scanner';
import { getScan } from '@bairmair/scanner/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { createUpload, deleteLocalScan } from '@/uploads/uploads';

/**
 * Right after a scan: the plan, rooms and total area as the server will compute them (same
 * converter), an optional name, then "Холбоос үүсгэх" (upload, process, link) or delete.
 */
export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const { session } = useAuth();
  const [title, setTitle] = useState('');

  const scan = useMemo(() => getScan(id), [id]);
  // Reads and converts the raw file once; a few MB take well under a second.
  const analysis = useMemo(() => (scan ? analyzeExport(scan.rawJson.textSync()) : null), [scan]);

  if (!scan || !analysis) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>{t('scanResult.notFound')}</Text>
      </View>
    );
  }

  const create = () => {
    if (!session) {
      router.push('/sign-in');
      return;
    }
    createUpload(scan.meta.id, session.user.id, title);
    router.back();
  };

  const discard = () =>
    Alert.alert(t('scanApp.review.discardTitle'), t('scanApp.review.discardBody'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('scanApp.review.discard'),
        style: 'destructive',
        onPress: () => {
          deleteLocalScan(scan.meta.id);
          router.back();
        },
      },
    ]);

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {analysis.ok ? (
        <>
          <ScanFloorPlan model={analysis.model} />
          <View style={card}>
            {analysis.model.rooms.map((room, index) => (
              <View key={room.id} style={styles.line}>
                <Text style={[styles.body, { color: colors.text }]}>
                  {roomDisplayName(t, room)}
                </Text>
                <Text style={[styles.body, { color: colors.text }]}>
                  {formatArea(analysis.metrics.rooms[index]?.areaM2 ?? 0, locale)}
                </Text>
              </View>
            ))}
            <View style={[styles.line, styles.total, { borderColor: colors.border }]}>
              <Text style={[styles.body, styles.bold, { color: colors.text }]}>
                {t('viewer.totalArea')}
              </Text>
              <Text style={[styles.body, styles.bold, { color: colors.text }]}>
                {formatArea(analysis.metrics.totalAreaM2, locale)}
              </Text>
            </View>
            <Text style={[styles.small, { color: colors.textMuted }]}>
              {t('viewer.approximateScanned')}
            </Text>
          </View>

          <TextField
            label={t('scanApp.review.name')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('scanApp.review.namePlaceholder')}
            maxLength={80}
            returnKeyType="done"
          />
          <Button title={t('scanApp.review.create')} icon="share" onPress={create} />
        </>
      ) : (
        <View style={card}>
          <Text style={[styles.body, { color: colors.danger }]}>
            {t('scanResult.convertFailed')}
          </Text>
          <Text style={[styles.mono, { color: colors.textMuted }]}>{analysis.error}</Text>
        </View>
      )}

      <Button title={t('scanApp.review.discard')} variant="outline" onPress={discard} />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/local/[id]', params: { id: scan.meta.id } })}
        style={styles.filesLink}
      >
        <Text style={[styles.small, { color: colors.textMuted }]}>{t('scanResult.files')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.lg, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  total: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  body: { fontSize: 16, lineHeight: 22 },
  bold: { fontWeight: '700' },
  small: { fontSize: 14, lineHeight: 20 },
  mono: { fontSize: 13, fontFamily: 'Menlo' },
  filesLink: { alignSelf: 'center', padding: 8 },
});
