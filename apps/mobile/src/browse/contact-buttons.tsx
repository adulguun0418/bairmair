import { dbErrorKey } from '@bairmair/db';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { formatMongolianPhone } from '@/auth/phone';
import { useI18n } from '@/i18n/i18n';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'shown'; phone: string }
  | { kind: 'error'; message: 'rateLimited' | 'unavailable' | 'notAvailable' | 'failed' };

/**
 * Tap to reveal the seller's number (rate-limited by `reveal_listing_contact`, like the web
 * page), then call or send an SMS through the phone's own apps.
 */
export function ContactButtons({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const colors = useColors();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const reveal = async () => {
    setState({ kind: 'loading' });
    const { data, error } = await supabase.rpc('reveal_listing_contact', {
      p_listing_id: listingId,
    });
    if (!error && data) {
      setState({ kind: 'shown', phone: data });
      return;
    }
    const key = dbErrorKey(error);
    setState({
      kind: 'error',
      message:
        key === 'rate_limited'
          ? 'rateLimited'
          : key === 'contact_unavailable'
            ? 'unavailable'
            : key === 'listing_not_available'
              ? 'notAvailable'
              : 'failed',
    });
  };

  if (state.kind === 'shown') {
    return (
      <View style={styles.box}>
        <Text style={[styles.phone, { color: colors.text }]} selectable>
          {formatMongolianPhone(state.phone)}
        </Text>
        <View style={styles.row}>
          <Button
            title={t('listingPage.contact.call')}
            onPress={() => void Linking.openURL(`tel:${state.phone}`)}
            style={styles.grow}
          />
          <Button
            title={t('listingPage.contact.sms')}
            variant="secondary"
            onPress={() => void Linking.openURL(`sms:${state.phone}`)}
            style={styles.grow}
          />
        </View>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          {t('listingPage.contact.mention')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Button
        title={
          state.kind === 'loading'
            ? t('listingPage.contact.loading')
            : t('listingPage.contact.show')
        }
        disabled={state.kind === 'loading'}
        onPress={() => void reveal()}
      />
      {state.kind === 'error' && (
        <Text style={[styles.note, { color: colors.danger }]} accessibilityRole="alert">
          {t(`listingPage.contact.errors.${state.message}`)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  phone: { fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  note: { fontSize: 13, textAlign: 'center' },
});
