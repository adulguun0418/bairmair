'use client';

import { formatMongolianPhone } from '@bairmair/browse';
import { ACCOUNT_PATH } from '@bairmair/db';
import { createTranslator, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInHref } from '@/components/auth/HeaderAuthLinks';
import { browserClient } from '@/lib/supabase-browser';

type Notice = { text: string; error: boolean } | null;

const input =
  'w-full rounded-xl border border-stone-300 px-3 py-2 outline-none focus:border-stone-900';
const primary =
  'rounded-full bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-700 disabled:opacity-50';
const secondary =
  'rounded-full border border-stone-300 px-4 py-2 font-medium hover:bg-stone-50 disabled:opacity-50';
const card = 'space-y-3 rounded-2xl bg-white p-5 shadow-sm';

/** The signed-in visitor's account: phone, name, agent page, sign-out and account deletion. */
export function AccountView({ locale }: { locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  const { session, ready } = useAuth();
  const user = session?.user ?? null;
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (ready && !session && !deleting)
      router.replace(signInHref(locale, localePath(locale, '/account')));
  }, [ready, session, deleting, locale, router]);

  if (!ready || !user) return <div className="h-64 animate-pulse rounded-2xl bg-stone-200" />;

  const signOut = async () => {
    if (!window.confirm(t('account.signOutTitle'))) return;
    await browserClient().auth.signOut({ scope: 'local' });
    router.push(localePath(locale, '/'));
  };

  const deleteAccount = async () => {
    if (!window.confirm(`${t('account.deleteTitle')}\n\n${t('account.deleteBody')}`)) return;
    setDeleting(true);
    setNotice(null);
    try {
      const response = await fetch(ACCOUNT_PATH, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session!.access_token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await browserClient().auth.signOut({ scope: 'local' });
      window.alert(t('account.deleted'));
      router.push(localePath(locale, '/'));
    } catch {
      setNotice({ text: t('account.deleteFailed'), error: true });
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('account.title')}</h1>

      <section className={card}>
        <h2 className="font-semibold">{t('account.phone')}</h2>
        {user.phone ? (
          <p className="flex justify-between gap-3">
            <span>{formatMongolianPhone(user.phone)}</span>
            <span className="text-emerald-700">{t('account.phoneVerified')}</span>
          </p>
        ) : (
          <p className="text-stone-600">{t('account.noPhone')}</p>
        )}
      </section>

      <NameForm userId={user.id} locale={locale} />
      <AgentForm userId={user.id} locale={locale} />

      <section className="flex flex-wrap items-center gap-3">
        <Link href={localePath(locale, '/saved')} className={secondary}>
          ♡ {t('favorites.title')}
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={deleting}
          className={secondary}
        >
          {t('account.signOut')}
        </button>
      </section>

      <section className="border-t border-stone-200 pt-4">
        <button
          type="button"
          onClick={() => void deleteAccount()}
          disabled={deleting}
          className="text-sm text-red-700 underline disabled:opacity-50"
        >
          {deleting ? t('account.deleting') : t('account.deleteAccount')}
        </button>
        {notice && (
          <p
            role="alert"
            className={`mt-2 text-sm ${notice.error ? 'text-red-700' : 'text-emerald-700'}`}
          >
            {notice.text}
          </p>
        )}
      </section>
    </div>
  );
}

function NameForm({ userId, locale }: { userId: string; locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let active = true;
    void browserClient()
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!active) return;
        setName(data?.display_name ?? '');
        setSaved(data?.display_name ?? '');
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const trimmed = name.trim();
  const save = async () => {
    setBusy(true);
    setNotice(null);
    const { error } = await browserClient()
      .from('profiles')
      .update({ display_name: trimmed || null })
      .eq('id', userId);
    setBusy(false);
    if (error) setNotice({ text: t('auth.errors.generic'), error: true });
    else {
      setSaved(trimmed);
      setNotice({ text: t('account.saved'), error: false });
    }
  };

  return (
    <form
      className={card}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="block space-y-1">
        <span className="font-semibold">{t('account.displayName')}</span>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNotice(null);
          }}
          placeholder={t('account.displayNamePlaceholder')}
          maxLength={80}
          autoComplete="name"
          className={input}
        />
      </label>
      <button
        type="submit"
        disabled={busy || saved === null || trimmed === saved}
        className={primary}
      >
        {t('account.save')}
      </button>
      {notice && (
        <p className={`text-sm ${notice.error ? 'text-red-700' : 'text-emerald-700'}`}>
          {notice.text}
        </p>
      )}
    </form>
  );
}

/** agent_profiles CHECK constraints. */
const AGENCY_NAME_MAX = 120;
const BIO_MAX = 2000;

/**
 * Registering as an agent: an agency name (and a short bio) creates `agent_profiles`, which makes
 * the account an agent with a public agent page. Admins verify agents in the dashboard.
 */
function AgentForm({ userId, locale }: { userId: string; locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [saved, setSaved] = useState<{ agencyName: string; bio: string; verified: boolean } | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  const [agencyName, setAgencyName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let active = true;
    void browserClient()
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
    setNotice(null);
    const values = { agency_name: name, bio: about || null };
    const client = browserClient();
    const { error } = saved
      ? await client.from('agent_profiles').update(values).eq('profile_id', userId)
      : await client.from('agent_profiles').insert(values);
    setBusy(false);
    if (error) {
      setNotice({ text: t('account.agent.failed'), error: true });
      return;
    }
    setSaved({ agencyName: name, bio: about, verified: saved?.verified ?? false });
    setNotice({ text: t('account.agent.saved'), error: false });
  };

  return (
    <form
      className={card}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className="font-semibold">{t('account.agent.title')}</h2>
      {saved ? (
        <p className={saved.verified ? 'text-emerald-700' : 'text-stone-600'}>
          {saved.verified ? t('account.agent.verified') : t('account.agent.pending')}{' '}
          <Link href={localePath(locale, `/agents/${userId}`)} className="underline">
            {t('listingPage.seller.profile')}
          </Link>
        </p>
      ) : (
        <p className="text-sm text-stone-600">{t('account.agent.intro')}</p>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('account.agent.agencyName')}</span>
        <input
          value={agencyName}
          onChange={(event) => {
            setAgencyName(event.target.value);
            setNotice(null);
          }}
          maxLength={AGENCY_NAME_MAX}
          autoComplete="organization"
          className={input}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('account.agent.bio')}</span>
        <textarea
          value={bio}
          onChange={(event) => {
            setBio(event.target.value);
            setNotice(null);
          }}
          placeholder={t('account.agent.bioPlaceholder')}
          maxLength={BIO_MAX}
          rows={4}
          className={input}
        />
      </label>
      <button
        type="submit"
        disabled={busy || name === '' || !changed}
        className={saved ? secondary : primary}
      >
        {saved ? t('account.agent.save') : t('account.agent.become')}
      </button>
      {notice && (
        <p className={`text-sm ${notice.error ? 'text-red-700' : 'text-emerald-700'}`}>
          {notice.text}
        </p>
      )}
    </form>
  );
}
