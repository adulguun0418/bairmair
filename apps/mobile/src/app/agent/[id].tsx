import { loadAgentPage, type AgentPageData } from '@bairmair/browse';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { ListingCard } from '@/browse/listing-card';
import { useI18n } from '@/i18n/i18n';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; agent: AgentPageData }
  | { kind: 'missing' }
  | { kind: 'error' };

/** An agent's public page: agency, bio and live listings (the web's `/agents/[id]`). */
export default function AgentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const key = `${id}:${attempt}`;
  /** The result for one id and attempt; anything else is still loading. */
  const [loaded, setLoaded] = useState<{ key: string; state: State }>();
  const state: State = loaded?.key === key ? loaded.state : { kind: 'loading' };

  useEffect(() => {
    let active = true;
    loadAgentPage(supabase, id)
      .then((agent) => {
        if (active)
          setLoaded({ key, state: agent ? { kind: 'ready', agent } : { kind: 'missing' } });
      })
      .catch(() => {
        if (active) setLoaded({ key, state: { kind: 'error' } });
      });
    return () => {
      active = false;
    };
  }, [id, key]);

  if (state.kind !== 'ready') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {state.kind === 'loading' ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text style={[styles.body, { color: colors.text }]}>
              {state.kind === 'missing' ? t('browse.notFound') : t('browse.loadFailed')}
            </Text>
            {state.kind === 'error' && (
              <Button
                title={t('browse.retry')}
                variant="secondary"
                onPress={() => setAttempt((n) => n + 1)}
              />
            )}
          </>
        )}
      </View>
    );
  }

  const { agent } = state;
  const muted = { color: colors.textMuted };
  return (
    <>
      <Stack.Screen options={{ title: agent.agencyName }} />
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={agent.listings}
        keyExtractor={(row) => row.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{agent.agencyName}</Text>
            <Text style={[styles.body, muted]}>
              {agent.verified ? t('agentPage.verified') : t('agentPage.agent')}
              {agent.displayName ? ` · ${agent.displayName}` : ''}
            </Text>
            <Text style={[styles.small, muted]}>
              {t('agentPage.since', { year: new Date(agent.since).getFullYear() })}
            </Text>
            {agent.bio ? (
              <Text style={[styles.body, { color: colors.text }]}>{agent.bio}</Text>
            ) : null}
            <Text style={[styles.heading, { color: colors.text }]}>
              {t('agentPage.listings')} ({agent.listingCount})
            </Text>
          </View>
        }
        ListEmptyComponent={<Text style={[styles.body, muted]}>{t('agentPage.noListings')}</Text>}
        renderItem={({ item }) => (
          <ListingCard
            card={item}
            compact
            onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })}
          />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  list: { padding: 16, gap: 12 },
  header: { gap: 6, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14 },
});
