import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '@bairmair/native-ui/i18n';
import { supabase } from '@/lib/supabase';
import { Button } from '@bairmair/native-ui/button';
import { TextField } from '@bairmair/native-ui/text-field';
import { Icon } from '@bairmair/native-ui/icon';
import { radius, useColors } from '@bairmair/native-ui/theme';
import { Text } from '@bairmair/native-ui/text';

/** agent_profiles CHECK constraints. */
const AGENCY_NAME_MAX = 120;
const BIO_MAX = 2000;

interface AgentProfile {
  agencyName: string;
  bio: string;
  verified: boolean;
}

/**
 * Registering as an agent: an agency name (and a short bio) creates `agent_profiles`, which makes
 * the account an agent and gives it a public agent page. Admins verify agents in the dashboard.
 */
export function AgentSection({
  userId,
  reloadKey = 0,
}: {
  userId: string;
  /** Changing it loads the agent profile again (pull to refresh). */
  reloadKey?: number;
}) {
  const { t } = useI18n();
  const colors = useColors();
  const [saved, setSaved] = useState<AgentProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [agencyName, setAgencyName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    void supabase
      .from('agent_profiles')
      .select('agency_name, bio, verified')
      .eq('profile_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error) return;
        if (data) {
          const profile = {
            agencyName: data.agency_name,
            bio: data.bio ?? '',
            verified: data.verified,
          };
          setSaved(profile);
          setAgencyName(profile.agencyName);
          setBio(profile.bio);
        } else {
          // None, or removed on the website since the last load.
          setSaved(null);
          setAgencyName('');
          setBio('');
        }
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  // Unknown until loaded: saving now could try to create a profile that exists.
  if (!loaded) return null;

  const name = agencyName.trim();
  const about = bio.trim();
  const changed = !saved || name !== saved.agencyName || about !== saved.bio;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const values = { agency_name: name, bio: about || null };
    const { error } = saved
      ? await supabase.from('agent_profiles').update(values).eq('profile_id', userId)
      : await supabase.from('agent_profiles').insert(values);
    setBusy(false);
    if (error) {
      setMessage({ text: t('account.agent.failed'), error: true });
      return;
    }
    setSaved({ agencyName: name, bio: about, verified: saved?.verified ?? false });
    setMessage({ text: t('account.agent.saved'), error: false });
  };

  /** Deleting the agent profile makes the account an owner again (database trigger). */
  const leave = async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from('agent_profiles').delete().eq('profile_id', userId);
    setBusy(false);
    if (error) {
      setMessage({ text: t('account.agent.leaveFailed'), error: true });
      return;
    }
    setSaved(null);
    setAgencyName('');
    setBio('');
    setMessage({ text: t('account.agent.left'), error: false });
  };

  const confirmLeave = () =>
    Alert.alert(t('account.agent.leaveTitle'), t('account.agent.leaveBody'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('account.agent.leaveConfirm'),
        style: 'destructive',
        onPress: () => void leave(),
      },
    ]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.headingRow}>
        <Icon name="briefcase" size={18} color={colors.brand} />
        <Text style={[styles.heading, { color: colors.text }]}>{t('account.agent.title')}</Text>
      </View>
      {saved ? (
        <View
          style={[
            styles.status,
            { backgroundColor: saved.verified ? colors.successSoft : colors.surface2 },
          ]}
        >
          {saved.verified && <Icon name="verified" size={12} color={colors.success} />}
          <Text
            style={[
              styles.statusText,
              { color: saved.verified ? colors.onSuccessSoft : colors.textMuted },
            ]}
          >
            {saved.verified ? t('account.agent.verified') : t('account.agent.pending')}
          </Text>
        </View>
      ) : (
        <Text style={[styles.small, { color: colors.textMuted }]}>{t('account.agent.intro')}</Text>
      )}
      <TextField
        label={t('account.agent.agencyName')}
        value={agencyName}
        onChangeText={(value) => {
          setAgencyName(value);
          setMessage(null);
        }}
        maxLength={AGENCY_NAME_MAX}
        textContentType="organizationName"
      />
      <TextField
        label={t('account.agent.bio')}
        value={bio}
        onChangeText={(value) => {
          setBio(value);
          setMessage(null);
        }}
        placeholder={t('account.agent.bioPlaceholder')}
        maxLength={BIO_MAX}
        multiline
        style={styles.multiline}
      />
      {saved && name === '' && (
        <Text style={[styles.small, { color: colors.textMuted }]}>
          {t('account.agent.nameRequired')}
        </Text>
      )}
      <Button
        title={saved ? t('account.agent.save') : t('account.agent.become')}
        variant={saved ? 'secondary' : 'primary'}
        disabled={busy || name === '' || !changed}
        onPress={() => void save()}
      />
      {saved && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={confirmLeave}
          style={({ pressed }) => [styles.leave, (pressed || busy) && { opacity: 0.5 }]}
        >
          <Text style={[styles.small, { color: colors.danger }]}>{t('account.agent.leave')}</Text>
        </Pressable>
      )}
      {message && (
        <Text style={[styles.body, { color: message.error ? colors.danger : colors.success }]}>
          {message.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: 16, gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusText: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  leave: { alignSelf: 'center', paddingVertical: 6 },
});
