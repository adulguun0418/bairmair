import { dbErrorKey } from '@bairmair/db';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { formatMongolianPhone } from '@bairmair/browse';
import { useI18n } from '@/i18n/i18n';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { useColors } from '@/ui/theme';
import { Text } from '@/ui/text';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'shown'; phone: string }
  | { kind: 'error'; message: 'rateLimited' | 'unavailable' | 'notAvailable' | 'failed' };

/**
 * Tap to reveal the seller's number (rate-limited by `reveal_listing_contact`, like the web
 * page), then call or send an SMS through the phone's own apps. Sized for the listing screen's
 * bottom bar: one primary button that becomes "call <number>", with a square SMS button beside.
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
    const phone = formatMongolianPhone(state.phone);
    return (
      <View style={styles.box}>
        <View style={styles.row}>
          <Button
            title={phone}
            icon="phone"
            accessibilityLabel={t('listingSheet.callNumber', { phone })}
            onPress={() => void Linking.openURL(`tel:${state.phone}`)}
            style={styles.grow}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('listingPage.contact.sms')}
            onPress={() => void Linking.openURL(`sms:${state.phone}`)}
            style={({ pressed }) => [
              styles.square,
              { borderColor: colors.borderStrong, transform: [{ scale: pressed ? 0.94 : 1 }] },
            ]}
          >
            <Icon name="message" size={20} color={colors.text} />
          </Pressable>
        </View>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          {t('listingPage.contact.mention')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      {state.kind === 'error' && (
        <Text style={[styles.note, { color: colors.danger }]} accessibilityRole="alert">
          {t(`listingPage.contact.errors.${state.message}`)}
        </Text>
      )}
      <Button
        title={
          state.kind === 'loading'
            ? t('listingPage.contact.loading')
            : t('listingPage.contact.show')
        }
        icon="phone"
        disabled={state.kind === 'loading'}
        onPress={() => void reveal()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  row: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  square: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
