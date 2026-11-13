import { daysLeftInSearch, LISTING_FRESHNESS } from '@bairmair/db';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';
import { confirmAvailable, fetchLastConfirmed } from './server-listings';
import { Text } from '@/ui/text';

/** The last confirmation as read from the server, and when it was read. */
interface Confirmation {
  at: string | null;
  checkedAt: Date;
}

type Action = 'idle' | 'confirming' | 'confirmed' | 'failed';

/**
 * Freshness of a published listing: how long it stays in search, and "still available", which
 * keeps it there for another 14 days. Read from the server each time the editor is shown.
 */
export function FreshnessSection({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const colors = useColors();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [action, setAction] = useState<Action>('idle');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchLastConfirmed(supabase, listingId)
        .then((at) => {
          if (active) setConfirmation({ at, checkedAt: new Date() });
        })
        .catch(() => {
          // Offline: the section says so and the button still tries.
        });
      return () => {
        active = false;
      };
    }, [listingId]),
  );

  const confirm = async () => {
    setAction('confirming');
    try {
      const at = await confirmAvailable(supabase, listingId);
      setConfirmation({ at, checkedAt: new Date() });
      setAction('confirmed');
    } catch {
      setAction('failed');
    }
  };

  const daysLeft = confirmation ? daysLeftInSearch(confirmation.at, confirmation.checkedAt) : null;
  const status = !confirmation
    ? { text: t('listingStatus.freshness.unknown'), color: colors.textMuted }
    : daysLeft === null
      ? { text: t('listingStatus.freshness.hidden'), color: colors.danger }
      : daysLeft === 0
        ? { text: t('listingStatus.freshness.lastDay'), color: colors.warning }
        : {
            text: t('listingStatus.freshness.daysLeft', { count: daysLeft }),
            color: daysLeft <= 3 ? colors.warning : colors.text,
          };

  return (
    <View style={styles.column}>
      <Text style={[styles.body, { color: status.color }]}>{status.text}</Text>
      <Text style={[styles.small, { color: colors.textMuted }]}>
        {t('listingStatus.freshness.explain', { days: LISTING_FRESHNESS.confirmEveryDays })}
      </Text>
      <Button
        title={
          action === 'confirming'
            ? t('listingStatus.freshness.confirming')
            : t('listingStatus.freshness.confirm')
        }
        disabled={action === 'confirming'}
        onPress={() => void confirm()}
      />
      {action === 'confirmed' && (
        <Text style={[styles.body, { color: colors.success }]}>
          {t('listingStatus.freshness.confirmed')}
        </Text>
      )}
      {action === 'failed' && (
        <Text style={[styles.body, { color: colors.danger }]}>
          {t('listingStatus.freshness.failed')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 10 },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
});
