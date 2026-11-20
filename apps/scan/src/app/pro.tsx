import {
  fetchAppleSubscription,
  fetchScanPlan,
  formatProUntil,
  type AppleProSubscription,
  type ScanPlan,
} from '@bairmair/browse';
import {
  APPLE_SCAN_PRO_PRODUCTS,
  USER_SCAN_FREE_LIMIT,
  USER_SCAN_PRO_LIMIT,
  type AppleScanProProductId,
} from '@bairmair/db';
import { openSitePage, useAuth } from '@bairmair/native-auth';
import { Button } from '@bairmair/native-ui/button';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Icon } from '@bairmair/native-ui/icon';
import { Text } from '@bairmair/native-ui/text';
import { radius, useColors } from '@bairmair/native-ui/theme';
import type { ProductSubscription } from 'expo-iap';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { yearlySavingPercent } from '@/pro/delivery';
import {
  buyPro,
  loadProProducts,
  manageSubscriptions,
  onPurchaseEvent,
  restorePro,
  type BuyOutcome,
} from '@/pro/purchases';

type Notice = { key: NoticeKey; tone: 'success' | 'muted' | 'danger' } | null;
type NoticeKey =
  'done' | 'pending' | 'otherAccount' | 'notActivated' | 'failed' | 'restored' | 'nothingToRestore';

function notice(outcome: BuyOutcome): Notice {
  switch (outcome) {
    case 'delivered':
      return { key: 'done', tone: 'success' };
    case 'pending':
      return { key: 'pending', tone: 'muted' };
    case 'other_account':
      return { key: 'otherAccount', tone: 'danger' };
    case 'retry':
      return { key: 'notActivated', tone: 'danger' };
    case 'cancelled':
      return null;
    default:
      return { key: 'failed', tone: 'danger' };
  }
}

const ORDER: AppleScanProProductId[] = [
  'mn.bairmair.scan.pro.yearly',
  'mn.bairmair.scan.pro.monthly',
];

/**
 * The Pro paywall (App Store rule 3.1.2): what Pro gives, the plans with StoreKit's prices and
 * periods, the renewal terms, Terms and Privacy, "Restore purchases". While Pro is on (bought in
 * any way) it shows until when, and "Manage subscription" for an App Store subscription. Apple's
 * In-App Purchase is the only way to buy here (rule 3.1.3).
 */
export default function ProScreen() {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [plan, setPlan] = useState<ScanPlan | null>(null);
  const [apple, setApple] = useState<AppleProSubscription | null>(null);
  const [products, setProducts] = useState<ProductSubscription[] | null>(null);
  const [productsFailed, setProductsFailed] = useState(false);
  const [selected, setSelected] = useState<AppleScanProProductId>('mn.bairmair.scan.pro.yearly');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [message, setMessage] = useState<Notice>(null);

  const loadPlan = useCallback(async () => {
    const [nextPlan, nextApple] = await Promise.all([
      fetchScanPlan(supabase),
      fetchAppleSubscription(supabase).catch(() => null),
    ]);
    setPlan(nextPlan);
    setApple(nextApple);
  }, []);

  const loadProducts = useCallback(() => {
    loadProProducts().then(
      (list) => {
        setProducts(list);
        setProductsFailed(list.length === 0);
      },
      () => setProductsFailed(true),
    );
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    Promise.all([fetchScanPlan(supabase), fetchAppleSubscription(supabase).catch(() => null)]).then(
      ([nextPlan, nextApple]) => {
        if (!active) return;
        setPlan(nextPlan);
        setApple(nextApple);
      },
      () => undefined,
    );
    loadProducts();
    return () => {
      active = false;
    };
  }, [userId, loadProducts]);

  // Purchases finished outside this screen's own call (Ask to Buy approved meanwhile).
  useEffect(
    () =>
      onPurchaseEvent((event) => {
        if (event === 'delivered') {
          setMessage({ key: 'done', tone: 'success' });
          void loadPlan().catch(() => undefined);
        }
      }),
    [loadPlan],
  );

  // Signed out meanwhile (the paywall is only opened signed in): leave.
  useEffect(() => {
    if (!userId && router.canGoBack()) router.back();
  }, [userId, router]);

  if (!userId) return null;

  const byId = new Map((products ?? []).map((product) => [product.id, product]));
  const monthly = byId.get('mn.bairmair.scan.pro.monthly');
  const yearly = byId.get('mn.bairmair.scan.pro.yearly');
  const saving = yearlySavingPercent(monthly, yearly);
  const proUntil = plan?.proUntil ?? null;

  const buy = async () => {
    setBusy('buy');
    setMessage(null);
    const outcome = await buyPro(selected, userId);
    setMessage(notice(outcome));
    if (outcome === 'delivered') await loadPlan().catch(() => undefined);
    setBusy(null);
  };

  const restore = async () => {
    setBusy('restore');
    setMessage(null);
    try {
      const results = await restorePro();
      if (results.includes('delivered')) {
        setMessage({ key: 'restored', tone: 'success' });
        await loadPlan().catch(() => undefined);
      } else if (results.includes('other_account')) {
        setMessage({ key: 'otherAccount', tone: 'danger' });
      } else if (results.includes('retry')) {
        setMessage({ key: 'notActivated', tone: 'danger' });
      } else {
        setMessage({ key: 'nothingToRestore', tone: 'muted' });
      }
    } catch {
      setMessage({ key: 'failed', tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const toneColor = (tone: NonNullable<Notice>['tone']) =>
    tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.textMuted;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.header}>
        <View style={[styles.mark, { backgroundColor: colors.ink }]}>
          <Icon name="sparkle" size={26} color={colors.onInk} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{t('scanApp.pro.title')}</Text>
        <Text style={[styles.body, styles.center, { color: colors.textMuted }]}>
          {t('scanApp.pro.lead')}
        </Text>
      </View>

      <View style={styles.benefits}>
        {(['scans', 'links', 'keep'] as const).map((key) => (
          <View key={key} style={styles.benefit}>
            <Icon name="check" size={18} color={colors.brand} />
            <Text style={[styles.body, styles.grow, { color: colors.text }]}>
              {t(`scanApp.pro.benefits.${key}`, { free: USER_SCAN_FREE_LIMIT })}
            </Text>
          </View>
        ))}
        <Text style={[styles.small, { color: colors.textMuted }]}>
          {t('scanApp.pro.fairUse', { limit: USER_SCAN_PRO_LIMIT })}
        </Text>
      </View>

      {plan === null ? (
        <ActivityIndicator style={styles.spinner} />
      ) : proUntil ? (
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.heading, { color: colors.brand }]}>
            {t('scanApp.pro.active', { date: formatProUntil(proUntil, locale) })}
          </Text>
          {apple && (
            <>
              {apple.autoRenew !== null && (
                <Text style={[styles.small, { color: colors.textMuted }]}>
                  {apple.autoRenew ? t('scanApp.pro.renews') : t('scanApp.pro.notRenewing')}
                </Text>
              )}
              <Button
                title={t('scanApp.pro.manage')}
                variant="outline"
                onPress={() => void manageSubscriptions().catch(() => undefined)}
              />
            </>
          )}
        </View>
      ) : (
        <>
          {products === null && !productsFailed ? (
            <ActivityIndicator style={styles.spinner} />
          ) : productsFailed ? (
            <View
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {t('scanApp.pro.productsFailed')}
              </Text>
              <Button
                title={t('scanApp.pro.retry')}
                variant="outline"
                onPress={() => {
                  setProducts(null);
                  setProductsFailed(false);
                  loadProducts();
                }}
              />
            </View>
          ) : (
            <View style={styles.plans}>
              {ORDER.filter((id) => byId.has(id)).map((id) => {
                const product = byId.get(id)!;
                const period = APPLE_SCAN_PRO_PRODUCTS[id].period;
                const active = selected === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelected(id)}
                    style={[
                      styles.plan,
                      {
                        backgroundColor: colors.surface,
                        borderColor: active ? colors.brand : colors.border,
                        borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <View style={styles.grow}>
                      <Text style={[styles.heading, { color: colors.text }]}>
                        {period === 'year' ? t('scanApp.pro.yearly') : t('scanApp.pro.monthly')}
                      </Text>
                      <Text style={[styles.body, { color: colors.textMuted }]}>
                        {period === 'year'
                          ? t('scanApp.pro.perYear', { price: product.displayPrice })
                          : t('scanApp.pro.perMonth', { price: product.displayPrice })}
                      </Text>
                    </View>
                    {period === 'year' && saving !== null && (
                      <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                        <Text style={[styles.badgeText, { color: colors.accent }]}>
                          {t('scanApp.pro.save', { percent: saving })}
                        </Text>
                      </View>
                    )}
                    <Icon
                      name={active ? 'check' : 'chevron'}
                      size={active ? 22 : 14}
                      color={active ? colors.brand : colors.textSubtle}
                    />
                  </Pressable>
                );
              })}
              <Button
                title={busy === 'buy' ? t('scanApp.pro.subscribing') : t('scanApp.pro.subscribe')}
                disabled={busy !== null || !byId.has(selected)}
                onPress={() => void buy()}
              />
            </View>
          )}
          <Text style={[styles.small, { color: colors.textMuted }]}>
            {t('scanApp.pro.disclosure')}
          </Text>
        </>
      )}

      {message && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.body, styles.center, { color: toneColor(message.tone) }]}
        >
          {t(`scanApp.pro.${message.key}`)}
        </Text>
      )}

      <View style={styles.links}>
        <Pressable
          accessibilityRole="button"
          disabled={busy !== null}
          onPress={() => void restore()}
          hitSlop={8}
        >
          <Text style={[styles.link, { color: colors.accent }]}>
            {busy === 'restore' ? t('scanApp.pro.restoring') : t('scanApp.pro.restore')}
          </Text>
        </Pressable>
        <View style={styles.legal}>
          <Pressable
            accessibilityRole="link"
            onPress={() => openSitePage(env.siteUrl, 'terms', locale)}
            hitSlop={8}
          >
            <Text style={[styles.small, { color: colors.textMuted }]}>{t('footer.terms')}</Text>
          </Pressable>
          <Text style={[styles.small, { color: colors.textSubtle }]}>·</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => openSitePage(env.siteUrl, 'privacy', locale)}
            hitSlop={8}
          >
            <Text style={[styles.small, { color: colors.textMuted }]}>{t('footer.privacy')}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 20, paddingBottom: 48 },
  header: { alignItems: 'center', gap: 10 },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  heading: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  center: { textAlign: 'center' },
  grow: { flex: 1 },
  spinner: { marginVertical: 24 },
  benefits: { gap: 10 },
  benefit: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  card: { borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  plans: { gap: 12 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
  },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  links: { alignItems: 'center', gap: 12 },
  link: { fontSize: 15, fontWeight: '600' },
  legal: { flexDirection: 'row', gap: 8 },
});
