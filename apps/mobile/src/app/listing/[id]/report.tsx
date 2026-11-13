import { Constants, type Enums } from '@bairmair/db';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/auth/auth-provider';
import { useI18n } from '@/i18n/i18n';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/button';
import { ChoiceChips } from '@/ui/choice-chips';
import { TextField } from '@/ui/text-field';
import { useColors } from '@/ui/theme';

type Reason = Enums<'report_reason'>;

/** `reports.details` CHECK constraint. */
const MAX_DETAILS = 2000;
/** One report per user and listing (unique key). */
const UNIQUE_VIOLATION = '23505';

type Result = 'sent' | 'already' | 'failed' | null;

/** Report a listing: a reason, optional details. Signed-in users only (RLS). */
export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const signedIn = Boolean(useAuth().session);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  // The listing screen asks for sign-in before opening this sheet; a session can still end.
  if (!signedIn) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.body, { color: colors.text }]}>{t('report.signIn')}</Text>
        <Button title={t('report.close')} variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  if (result === 'sent' || result === 'already') {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.body, { color: colors.text }]}>
          {result === 'sent' ? t('report.sent') : t('report.already')}
        </Text>
        <Button title={t('report.close')} variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setResult(null);
    const trimmed = details.trim();
    const { error } = await supabase
      .from('reports')
      .insert({ listing_id: id, reason, details: trimmed || null });
    setBusy(false);
    setResult(!error ? 'sent' : error.code === UNIQUE_VIOLATION ? 'already' : 'failed');
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ChoiceChips
        label={t('report.reason')}
        choices={Constants.public.Enums.report_reason.map((value) => ({
          value,
          label: t(`report.reasons.${value}`),
        }))}
        value={reason}
        onChange={setReason}
      />
      <TextField
        label={t('report.details')}
        placeholder={t('report.detailsPlaceholder')}
        value={details}
        onChangeText={setDetails}
        maxLength={MAX_DETAILS}
        multiline
        style={styles.details}
      />
      {result === 'failed' && (
        <Text style={[styles.body, { color: colors.danger }]} accessibilityRole="alert">
          {t('report.failed')}
        </Text>
      )}
      <Button
        title={busy ? t('report.sending') : t('report.submit')}
        disabled={!reason || busy}
        onPress={() => void submit()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  body: { fontSize: 16, lineHeight: 22 },
  details: { minHeight: 96, textAlignVertical: 'top' },
});
