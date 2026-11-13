import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-provider';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';
import type { ListingStatus } from './form';
import { changeListingStatus, retryRefusedSync, useSyncStatus } from './listings';
import { isLive, type LocalListing } from './model';
import { missingToPublish } from './sync-plan';

/**
 * Publishing and the listing's life after it: publish, mark sold/rented, hide, publish again.
 * A status change is saved on the phone and sent by the sync engine like any other edit; the
 * database has the last word (verified phone, a photo, a complete listing).
 */
export function StatusSection({ listing }: { listing: LocalListing }) {
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const user = useAuth().session?.user ?? null;
  const sync = useSyncStatus(listing.id);
  const id = listing.id;

  const phoneVerified = Boolean(user?.phone && user.phone_confirmed_at);
  const pending = listing.statusRev > listing.statusSyncedRev;
  const refusal = pending && sync.state === 'failed' ? sync.key : null;
  const missing = missingToPublish(listing);
  const statusName = (status: ListingStatus) => t(`listings.statuses.${status}`);
  const text = { color: colors.text };
  const muted = { color: colors.textMuted };

  const set = (status: ListingStatus) => changeListingStatus(id, status);
  const confirm = (title: string, body: string, status: ListingStatus) =>
    Alert.alert(title, body, [
      { text: t('listingStatus.cancel'), style: 'cancel' },
      { text: t('listingStatus.confirm'), onPress: () => set(status) },
    ]);

  const verifyPhone = (
    <Button
      title={t('listingStatus.verifyPhone')}
      variant="secondary"
      onPress={() => router.push('/account')}
    />
  );

  if (pending) {
    const waitsForScan =
      isLive(listing.status) &&
      listing.form.areaOfficial.trim() === '' &&
      listing.scan?.processing === 'pending';
    return (
      <View style={styles.column}>
        <Text style={[styles.body, muted]}>
          {t('listingStatus.current', { status: statusName(listing.serverStatus) })}
        </Text>
        <Text style={[styles.body, text]}>
          {t('listingStatus.pending', { status: statusName(listing.status) })}
        </Text>
        {waitsForScan && !refusal && (
          <Text style={[styles.small, muted]}>{t('listingStatus.waitsForScan')}</Text>
        )}
        {refusal && (
          <>
            <Text style={[styles.body, { color: colors.danger }]}>
              {t('listingStatus.refused')} {t(`listings.syncErrors.${refusal}`)}
            </Text>
            {refusal === 'needsVerifiedPhone' && verifyPhone}
            <Button title={t('listingStatus.tryAgain')} onPress={() => retryRefusedSync(id)} />
          </>
        )}
        <Button
          title={t('listingStatus.cancelChange')}
          variant="secondary"
          onPress={() => set(listing.serverStatus)}
        />
      </View>
    );
  }

  const checklist =
    missing.length === 0 ? (
      <Text style={[styles.body, { color: colors.success }]}>{t('listingForm.publishReady')}</Text>
    ) : (
      <View style={styles.list}>
        <Text style={[styles.body, muted]}>{t('listingForm.publishMissing')}</Text>
        {missing.map((requirement) => (
          <Text key={requirement} style={[styles.body, text]}>
            • {t(`listingForm.requirements.${requirement}`)}
          </Text>
        ))}
      </View>
    );

  switch (listing.status) {
    case 'draft':
    case 'archived':
      return (
        <View style={styles.column}>
          <Text style={[styles.body, muted]}>
            {t('listingStatus.current', { status: statusName(listing.status) })}
          </Text>
          {checklist}
          {!phoneVerified && (
            <>
              <Text style={[styles.body, { color: colors.warning }]}>
                {t('listingStatus.needsPhone')}
              </Text>
              {verifyPhone}
            </>
          )}
          <Button
            title={
              listing.status === 'draft'
                ? t('listingStatus.publish')
                : t('listingStatus.publishAgain')
            }
            disabled={missing.length > 0 || !phoneVerified}
            onPress={() => set('published')}
          />
        </View>
      );
    case 'published': {
      const rent = listing.form.type === 'rent';
      return (
        <View style={styles.column}>
          <Text style={[styles.body, { color: colors.success }]}>
            {t('listingStatus.published')}
          </Text>
          <Button
            title={rent ? t('listingStatus.markRented') : t('listingStatus.markSold')}
            variant="secondary"
            onPress={() =>
              confirm(
                rent ? t('listingStatus.rentedTitle') : t('listingStatus.soldTitle'),
                t('listingStatus.soldBody'),
                'sold_or_rented',
              )
            }
          />
          <Button
            title={t('listingStatus.archive')}
            variant="secondary"
            onPress={() =>
              confirm(t('listingStatus.archiveTitle'), t('listingStatus.archiveBody'), 'archived')
            }
          />
        </View>
      );
    }
    case 'sold_or_rented':
      return (
        <View style={styles.column}>
          <Text style={[styles.body, muted]}>
            {t('listingStatus.current', { status: statusName(listing.status) })}
          </Text>
          <Button
            title={t('listingStatus.archive')}
            variant="secondary"
            onPress={() =>
              confirm(t('listingStatus.archiveTitle'), t('listingStatus.archiveBody'), 'archived')
            }
          />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  list: { gap: 4 },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
});
