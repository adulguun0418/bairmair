import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/text-field';
import { useColors } from '@/ui/theme';
import { Text } from '@/ui/text';

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
export function AgentSection({ userId }: { userId: string }) {
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
        }
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [userId]);

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

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.heading, { color: colors.text }]}>{t('account.agent.title')}</Text>
      {saved ? (
        <Text style={[styles.body, { color: saved.verified ? colors.success : colors.textMuted }]}>
          {saved.verified ? t('account.agent.verified') : t('account.agent.pending')}
        </Text>
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
      <Button
        title={saved ? t('account.agent.save') : t('account.agent.become')}
        variant={saved ? 'secondary' : 'primary'}
        disabled={busy || name === '' || !changed}
        onPress={() => void save()}
      />
      {message && (
        <Text style={[styles.body, { color: message.error ? colors.danger : colors.success }]}>
          {message.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 10 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
