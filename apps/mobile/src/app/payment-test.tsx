import {
  fetchPaymentHistory,
  paymentErrorKey,
  PaymentRequestError,
  paymentsApi,
  type PaymentHistoryRow,
} from '@bairmair/browse';
import { PAYMENT_LIMITS, PAYMENT_PRODUCTS, type PaymentResponse } from '@bairmair/db';
import { formatDate, formatMoney } from '@bairmair/i18n';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '@bairmair/native-auth';
import { useI18n } from '@bairmair/native-ui/i18n';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { Button } from '@bairmair/native-ui/button';
import { useColors } from '@bairmair/native-ui/theme';
import { Text } from '@bairmair/native-ui/text';

const api = paymentsApi(env.apiUrl);

function clockTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * QPay test with real money (temporary, like the website's `/payments/test`): pay the `test`
 * product (50₮) from a bank app, watch it turn paid, see recent payments. The server allows only
 * the user ids in `PAYMENT_TESTERS`; others see "testers only" with their id. JS only: bank apps
 * open through `Linking.openURL`, which needs no URL-scheme list in the build.
 */
export default function PaymentTestScreen() {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const { session, ready } = useAuth();
  const token = session?.access_token ?? null;
  const userId = session?.user.id ?? null;
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [history, setHistory] = useState<PaymentHistoryRow[] | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const reloadHistory = () => setHistoryVersion((version) => version + 1);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchPaymentHistory(supabase)
      .then((rows) => active && setHistory(rows))
      .catch(() => active && setHistory([]));
    return () => {
      active = false;
    };
  }, [userId, historyVersion]);

  const finished = useEffectEvent((next: PaymentResponse) => {
    setPayment(next);
    reloadHistory();
  });

  // While pending: ask every few seconds while the app is in front, and at once when the payer
  // comes back from the bank app.
  const pendingId = payment?.status === 'pending' ? payment.id : null;
  useEffect(() => {
    if (!pendingId || !token) return;
    let stopped = false;
    const poll = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        const next = await api.get(token, pendingId, true);
        if (!stopped && next.status !== 'pending') finished(next);
      } catch {
        // Try again on the next tick.
      }
    };
    const timer = setInterval(() => void poll(), PAYMENT_LIMITS.pollSeconds * 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void poll();
    });
    return () => {
      stopped = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [pendingId, token]);

  const start = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setPayment(await api.create(token, { product: 'test' }));
      reloadHistory();
    } catch (cause) {
      if (cause instanceof PaymentRequestError && cause.key === 'payment_forbidden') {
        setForbidden(true);
      } else {
        setError(t(paymentErrorKey(cause)));
      }
    } finally {
      setBusy(false);
    }
  }, [token, t]);

  const show = async (id: string) => {
    if (!token) return;
    setError(null);
    try {
      setPayment(await api.get(token, id, true));
    } catch (cause) {
      setError(t(paymentErrorKey(cause)));
    }
  };

  const cancel = () => {
    if (!token || !payment) return;
    Alert.alert(t('payments.cancelConfirm'), undefined, [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('payments.cancel'),
        style: 'destructive',
        onPress: () => {
          api
            .cancel(token, payment.id)
            .then((next) => {
              setPayment(next);
              reloadHistory();
            })
            .catch((cause: unknown) => setError(t(paymentErrorKey(cause))));
        },
      },
    ]);
  };

  const openApp = (link: string) => {
    Linking.openURL(link).catch(() => Alert.alert(t('payments.appMissing')));
  };

  const amount = formatMoney(PAYMENT_PRODUCTS.test.amount, 'MNT');

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={[styles.muted, { color: colors.textMuted }]}>
        {t('payments.testLead', { amount })}
      </Text>

      {!session ? (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.body, { color: colors.text }]}>{t('payments.signInNeeded')}</Text>
          <Button title={t('account.signIn')} onPress={() => router.push('/sign-in')} />
        </View>
      ) : forbidden ? (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.heading, { color: colors.text }]}>{t('payments.notTester')}</Text>
          <Text selectable style={[styles.muted, { color: colors.textMuted }]}>
            {t('payments.yourId', { id: userId })}
          </Text>
        </View>
      ) : !payment ? (
        <Button
          title={busy ? t('payments.creating') : t('payments.create', { amount })}
          icon="card"
          disabled={busy}
          onPress={() => void start()}
        />
      ) : payment.status !== 'pending' || !payment.checkout ? (
        <>
          <View
            style={[
              styles.card,
              styles.center,
              { backgroundColor: payment.status === 'paid' ? colors.successSoft : colors.surface2 },
            ]}
          >
            <Text style={[styles.amount, { color: colors.text }]}>
              {formatMoney(payment.amount, 'MNT')}
            </Text>
            <Text
              style={[
                styles.body,
                { color: payment.status === 'paid' ? colors.success : colors.textMuted },
              ]}
            >
              {payment.status === 'paid'
                ? t('payments.paid')
                : t(`payments.status.${payment.status}`)}
            </Text>
          </View>
          <Button title={t('payments.again')} onPress={() => setPayment(null)} />
        </>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.center}>
            <Text style={[styles.amount, { color: colors.text }]}>
              {formatMoney(payment.amount, 'MNT')}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>{payment.description}</Text>
          </View>

          <Text style={[styles.label, { color: colors.text }]}>{t('payments.apps')}</Text>
          <View style={styles.apps}>
            {payment.checkout.bankApps.map((app) => (
              <Pressable
                key={app.name}
                accessibilityRole="link"
                accessibilityLabel={app.description}
                onPress={() => openApp(app.link)}
                style={({ pressed }) => [styles.app, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Image source={{ uri: app.logo }} style={styles.logo} contentFit="cover" />
                <Text numberOfLines={2} style={[styles.appName, { color: colors.text }]}>
                  {locale === 'mn' ? app.description : app.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Button
            title={t('payments.openQPay')}
            variant="outline"
            onPress={() => void WebBrowser.openBrowserAsync(payment.checkout!.shortUrl)}
          />

          <View style={styles.center}>
            <Image
              source={{ uri: `data:image/png;base64,${payment.checkout.qrImage}` }}
              style={styles.qr}
              contentFit="contain"
              accessibilityLabel={t('payments.qrOtherPhone')}
            />
            <Text style={[styles.small, { color: colors.textMuted }]}>
              {t('payments.qrOtherPhone')}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={[styles.small, { color: colors.textMuted }]}>{t('payments.waiting')}</Text>
            <Text style={[styles.small, { color: colors.textMuted }]}>
              {t('payments.validUntil', { time: clockTime(payment.expiresAt) })}
            </Text>
          </View>
          <Button title={t('payments.cancel')} variant="secondary" size="small" onPress={cancel} />
        </View>
      )}

      {error && <Text style={[styles.body, { color: colors.danger }]}>{error}</Text>}

      {session && (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.heading, { color: colors.text }]}>{t('payments.history')}</Text>
          {history === null ? null : history.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              {t('payments.noHistory')}
            </Text>
          ) : (
            history.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                onPress={() => void show(row.id)}
                style={({ pressed }) => [styles.historyRow, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.small, styles.grow, { color: colors.text }]}>
                  {formatDate(row.createdAt, locale)}
                </Text>
                <Text style={[styles.small, { color: colors.text }]}>
                  {formatMoney(row.amount, 'MNT')}
                </Text>
                <Text
                  style={[
                    styles.small,
                    { color: row.status === 'paid' ? colors.success : colors.textMuted },
                  ]}
                >
                  {t(`payments.status.${row.status}`)}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 16, padding: 16, gap: 12 },
  center: { alignItems: 'center', gap: 4 },
  heading: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  muted: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  amount: { fontSize: 30, fontWeight: '700' },
  apps: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  app: { width: '25%', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  logo: { width: 48, height: 48, borderRadius: 12 },
  appName: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  qr: { width: 200, height: 200, borderRadius: 12, backgroundColor: '#ffffff' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  grow: { flex: 1 },
});
