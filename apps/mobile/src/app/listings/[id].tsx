import { DISTRICTS, LISTING_LIMITS } from '@bairmair/db';
import { formatMoney, formatMoneyCompact } from '@bairmair/i18n';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInputProps,
} from 'react-native';
import { useI18n } from '@/i18n/i18n';
import {
  formToFields,
  missingForPublish,
  parseNumberInput,
  type FormField,
  type ListingForm,
} from '@/listings/form';
import {
  addPickedPhotos,
  deleteListing,
  discardIfUntouched,
  editListing,
  photoUri,
  removeListingPhoto,
  useLocalListing,
} from '@/listings/listings';
import { locateHere, type LocateResult } from '@/listings/location';
import {
  movePhoto,
  photoSlotsLeft,
  setLocation,
  updateForm,
  type LocalListing,
  type LocalPhoto,
} from '@/listings/model';
import { pickFromLibrary, takePhoto } from '@/listings/photos';
import { SyncStatusLine } from '@/listings/sync-status-line';
import { Button } from '@/ui/button';
import { ChoiceChips } from '@/ui/choice-chips';
import { Section } from '@/ui/section';
import { TextField } from '@/ui/text-field';
import { useColors } from '@/ui/theme';
import { ToggleRow } from '@/ui/toggle-row';

const nowIso = () => new Date().toISOString();

/** Form fields edited as text. */
type TextFormField = {
  [K in FormField]: ListingForm[K] extends string ? K : never;
}[FormField];

/** Create or edit a listing. Every change is saved on the phone at once and synced after. */
export default function ListingEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listing = useLocalListing(id);
  const { t } = useI18n();
  const colors = useColors();

  // A new listing the seller backs out of without entering anything is not kept.
  useEffect(() => () => discardIfUntouched(id), [id]);

  if (!listing || listing.deleted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted }}>{t('listingForm.notFound')}</Text>
      </View>
    );
  }
  return <Editor listing={listing} />;
}

function Editor({ listing }: { listing: LocalListing }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const id = listing.id;
  const form = listing.form;
  const { errors } = formToFields(form);
  const sale = form.type === 'sale';
  const currency = sale ? 'MNT' : form.currency;

  const set = (patch: Partial<ListingForm>) =>
    editListing(id, (current, now) => updateForm(current, patch, now));

  /** Errors are shown as the seller types; a missing title is explained by the status line. */
  const error = (field: FormField): string | null => {
    const key = errors[field];
    return key && key !== 'required' ? t(`listingForm.errors.${key}`) : null;
  };

  const field = (
    name: TextFormField,
    label: string,
    props: TextInputProps & { hint?: string | null } = {},
  ) => (
    <TextField
      label={label}
      value={form[name]}
      onChangeText={(value) => set({ [name]: value } as Partial<ListingForm>)}
      error={error(name)}
      {...props}
    />
  );

  const price = parseNumberInput(form.price);
  const priceHint =
    price !== null && !Number.isNaN(price) && price >= 1000
      ? `${formatMoney(price, currency)} · ${formatMoneyCompact(price, currency, locale)}`
      : null;

  const missing = missingForPublish({
    form,
    hasLocation: listing.location !== null,
    photoCount: listing.photos.length,
  });

  const confirmDelete = () =>
    Alert.alert(t('listingForm.deleteTitle'), t('listingForm.deleteBody'), [
      { text: t('listingForm.cancel'), style: 'cancel' },
      {
        text: t('listingForm.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          deleteListing(id);
          router.back();
        },
      },
    ]);

  const yesNo = [
    { value: true, label: t('listingForm.yes') },
    { value: false, label: t('listingForm.no') },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <Stack.Screen
        options={{
          title: listing.remote.createAttempted
            ? t('listingForm.editTitle')
            : t('listingForm.newTitle'),
        }}
      />
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.small, { color: colors.textMuted }]}>
          {t(`listings.statuses.${listing.status}`)}
        </Text>
        <SyncStatusLine listing={listing} />
      </View>

      <Section title={t('listingForm.sections.type')}>
        <ChoiceChips
          choices={[
            { value: 'sale' as const, label: t('listingForm.types.sale') },
            { value: 'rent' as const, label: t('listingForm.types.rent') },
          ]}
          value={form.type}
          onChange={(type) => {
            if (type) set({ type });
          }}
          allowClear={false}
        />
      </Section>

      <Section title={t('listingForm.sections.basics')}>
        {field('title', t('listingForm.title'), {
          placeholder: t('listingForm.titlePlaceholder'),
          maxLength: LISTING_LIMITS.title.max,
          returnKeyType: 'done',
        })}
        {field('description', t('listingForm.description'), {
          placeholder: t('listingForm.descriptionPlaceholder'),
          maxLength: LISTING_LIMITS.description.max,
          multiline: true,
          style: styles.multiline,
        })}
      </Section>

      <Section title={t('listingForm.sections.price')}>
        {!sale && (
          <ChoiceChips
            label={t('listingForm.currency')}
            choices={[
              { value: 'MNT' as const, label: '₮ MNT' },
              { value: 'USD' as const, label: '$ USD' },
            ]}
            value={form.currency}
            onChange={(value) => {
              if (value) set({ currency: value });
            }}
            allowClear={false}
          />
        )}
        {field(
          'price',
          `${sale ? t('listingForm.price') : t('listingForm.priceRent')} (${currency === 'USD' ? '$' : '₮'})`,
          {
            keyboardType: 'number-pad',
            maxLength: 20,
            hint: priceHint,
          },
        )}
        <ToggleRow
          label={t('listingForm.negotiable')}
          value={form.negotiable}
          onValueChange={(negotiable) => set({ negotiable })}
        />
        {sale ? (
          <ChoiceChips
            label={t('listingForm.mortgage')}
            choices={yesNo}
            value={form.mortgageEligible}
            onChange={(mortgageEligible) => set({ mortgageEligible })}
          />
        ) : (
          <>
            {field('deposit', `${t('listingForm.deposit')} (${currency === 'USD' ? '$' : '₮'})`, {
              keyboardType: 'number-pad',
              maxLength: 20,
            })}
            {field('minTermMonths', t('listingForm.minTerm'), {
              keyboardType: 'number-pad',
              maxLength: 3,
            })}
            <ChoiceChips
              label={t('listingForm.utilities')}
              choices={yesNo}
              value={form.utilitiesIncluded}
              onChange={(utilitiesIncluded) => set({ utilitiesIncluded })}
            />
          </>
        )}
      </Section>

      <Section title={t('listingForm.sections.property')}>
        {field('rooms', t('listingForm.rooms'), {
          keyboardType: 'number-pad',
          maxLength: 2,
          hint: t('listingForm.roomsHint'),
        })}
        {field('areaOfficial', t('listingForm.area'), {
          keyboardType: 'decimal-pad',
          maxLength: 10,
          hint: t('listingForm.areaHint'),
        })}
        <View style={styles.pair}>
          <View style={styles.grow}>
            {field('floor', t('listingForm.floor'), {
              keyboardType: 'numbers-and-punctuation',
              maxLength: 4,
            })}
          </View>
          <View style={styles.grow}>
            {field('totalFloors', t('listingForm.totalFloors'), {
              keyboardType: 'number-pad',
              maxLength: 3,
            })}
          </View>
        </View>
        {field('buildingYear', t('listingForm.buildingYear'), {
          keyboardType: 'number-pad',
          maxLength: 4,
        })}
        <ChoiceChips
          label={t('listingForm.material')}
          choices={(['panel', 'brick', 'monolithic', 'other'] as const).map((value) => ({
            value,
            label: t(`listingForm.materials.${value}`),
          }))}
          value={form.buildingMaterial}
          onChange={(buildingMaterial) => set({ buildingMaterial })}
        />
        <ToggleRow
          label={t('listingForm.newBuilding')}
          value={form.newBuilding}
          onValueChange={(newBuilding) => set({ newBuilding })}
        />
        <ChoiceChips
          label={t('listingForm.heating')}
          choices={(['central', 'autonomous', 'electric', 'other'] as const).map((value) => ({
            value,
            label: t(`listingForm.heatings.${value}`),
          }))}
          value={form.heating}
          onChange={(heating) => set({ heating })}
        />
        {field('balconies', t('listingForm.balconies'), {
          keyboardType: 'number-pad',
          maxLength: 2,
        })}
        <ChoiceChips
          label={t('listingForm.parking')}
          choices={(['none', 'outdoor', 'garage', 'underground'] as const).map((value) => ({
            value,
            label: t(`listingForm.parkings.${value}`),
          }))}
          value={form.parking}
          onChange={(parking) => set({ parking })}
        />
        <ChoiceChips
          label={t('listingForm.furnishing')}
          choices={(['none', 'partial', 'full'] as const).map((value) => ({
            value,
            label: t(`listingForm.furnishings.${value}`),
          }))}
          value={form.furnishing}
          onChange={(furnishing) => set({ furnishing })}
        />
      </Section>

      <Section title={t('listingForm.sections.location')}>
        <ChoiceChips
          label={t('listingForm.district')}
          choices={DISTRICTS.map((district) => ({
            value: district.id,
            label: locale === 'mn' ? district.nameMn : district.nameEn,
          }))}
          value={form.districtId}
          onChange={(districtId) => set({ districtId })}
        />
        {field('khoroo', t('listingForm.khoroo'), { keyboardType: 'number-pad', maxLength: 2 })}
        {field('complexName', t('listingForm.complexName'), {
          placeholder: t('listingForm.complexPlaceholder'),
          maxLength: LISTING_LIMITS.complexName.max,
        })}
        {field('addressText', t('listingForm.addressText'), {
          placeholder: t('listingForm.addressPlaceholder'),
          maxLength: LISTING_LIMITS.addressText.max,
          multiline: true,
          style: styles.multiline,
        })}
        <LocationPin listing={listing} />
        <ToggleRow
          label={t('listingForm.showExact')}
          hint={t('listingForm.showExactHint')}
          value={form.showExactLocation}
          onValueChange={(showExactLocation) => set({ showExactLocation })}
        />
        {field('unitNumber', t('listingForm.unitNumber'), {
          maxLength: LISTING_LIMITS.unitNumber.max,
          hint: t('listingForm.unitHint'),
        })}
      </Section>

      <Section title={t('listingForm.sections.photos')}>
        <Photos listing={listing} />
      </Section>

      <Section title={t('listingForm.sections.publish')}>
        {missing.length === 0 ? (
          <Text style={[styles.body, { color: colors.success }]}>
            {t('listingForm.publishReady')}
          </Text>
        ) : (
          <View style={styles.list}>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {t('listingForm.publishMissing')}
            </Text>
            {missing.map((requirement) => (
              <Text key={requirement} style={[styles.body, { color: colors.text }]}>
                • {t(`listingForm.requirements.${requirement}`)}
              </Text>
            ))}
          </View>
        )}
      </Section>

      <Button title={t('listingForm.delete')} variant="danger" onPress={confirmDelete} />
    </ScrollView>
  );
}

function LocationPin({ listing }: { listing: LocalListing }) {
  const { t } = useI18n();
  const colors = useColors();
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<Extract<LocateResult, { ok: false }> | null>(null);

  const locate = async () => {
    setLocating(true);
    setFailure(null);
    try {
      const result = await locateHere(nowIso);
      if (result.ok) {
        editListing(listing.id, (current, now) => setLocation(current, result.location, now));
      } else {
        setFailure(result);
      }
    } finally {
      setLocating(false);
    }
  };

  const location = listing.location;
  const needsSettings =
    failure?.reason === 'reduced' || (failure?.reason === 'denied' && !failure.canAskAgain);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{t('listingForm.pin')}</Text>
      <Text style={[styles.body, { color: location ? colors.success : colors.text }]}>
        {location
          ? location.accuracyM !== null
            ? t('listingForm.pinned', { meters: location.accuracyM })
            : t('listingForm.pinnedNoAccuracy')
          : t('listingForm.notPinned')}
      </Text>
      <Text style={[styles.small, { color: colors.textMuted }]}>{t('listingForm.pinHint')}</Text>
      {locating ? (
        <View style={styles.inline}>
          <ActivityIndicator />
          <Text style={{ color: colors.textMuted }}>{t('listingForm.locating')}</Text>
        </View>
      ) : (
        <Button
          title={location ? t('listingForm.updateLocation') : t('listingForm.useCurrentLocation')}
          variant="secondary"
          onPress={() => void locate()}
        />
      )}
      {failure && (
        <Text style={[styles.body, { color: colors.danger }]}>
          {t(`listingForm.locationErrors.${failure.reason}`)}
        </Text>
      )}
      {needsSettings && (
        <Button
          title={t('listingForm.openSettings')}
          variant="secondary"
          onPress={() => void Linking.openSettings()}
        />
      )}
    </View>
  );
}

function Photos({ listing }: { listing: LocalListing }) {
  const { t } = useI18n();
  const colors = useColors();
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const slots = photoSlotsLeft(listing);

  const add = async (source: 'library' | 'camera') => {
    setMessage(null);
    const picked = source === 'library' ? await pickFromLibrary(slots) : await takePhoto();
    if (picked.status === 'denied') {
      setMessage(t('listingForm.cameraDenied'));
      return;
    }
    if (picked.status !== 'picked') return;
    setPreparing(true);
    try {
      const failed = await addPickedPhotos(listing.id, picked.uris);
      if (failed > 0) setMessage(t('listingForm.photosFailed', { count: failed }));
    } finally {
      setPreparing(false);
    }
  };

  const showActions = (photo: LocalPhoto, index: number) => {
    const move = (to: number) =>
      editListing(listing.id, (current, now) => movePhoto(current, photo.id, to, now));
    const remove = () => removeListingPhoto(listing.id, photo);
    const actions = [
      { label: t('listingForm.photoActions.makeCover'), run: () => move(0), show: index > 0 },
      {
        label: t('listingForm.photoActions.moveEarlier'),
        run: () => move(index - 1),
        show: index > 1,
      },
      {
        label: t('listingForm.photoActions.moveLater'),
        run: () => move(index + 1),
        show: index < listing.photos.length - 1,
      },
    ].filter((action) => action.show);
    const title = t('listingForm.photoActions.title', { index: index + 1 });

    if (Platform.OS === 'ios') {
      const options = [
        ...actions.map((action) => action.label),
        t('listingForm.photoActions.remove'),
        t('listingForm.photoActions.cancel'),
      ];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options,
          destructiveButtonIndex: actions.length,
          cancelButtonIndex: actions.length + 1,
        },
        (button) => {
          if (button < actions.length) actions[button]!.run();
          else if (button === actions.length) remove();
        },
      );
    } else {
      // Android dialogs hold at most three buttons.
      Alert.alert(title, undefined, [
        { text: t('listingForm.photoActions.cancel'), style: 'cancel' },
        ...(index > 0
          ? [{ text: t('listingForm.photoActions.makeCover'), onPress: () => move(0) }]
          : []),
        {
          text: t('listingForm.photoActions.remove'),
          style: 'destructive' as const,
          onPress: remove,
        },
      ]);
    }
  };

  return (
    <>
      <Text style={[styles.small, { color: colors.textMuted }]}>
        {t('listingForm.photosHint', {
          count: listing.photos.length,
          max: LISTING_LIMITS.photos.max,
        })}
      </Text>
      {listing.photos.length > 0 && (
        <View style={styles.grid}>
          {listing.photos.map((photo, index) => (
            <Pressable
              key={photo.id}
              accessibilityRole="button"
              accessibilityLabel={t('listingForm.photoActions.title', { index: index + 1 })}
              onPress={() => showActions(photo, index)}
              style={({ pressed }) => [styles.thumbBox, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Image
                source={{ uri: photoUri(listing.id, photo) }}
                style={[styles.thumb, { backgroundColor: colors.surface }]}
                contentFit="cover"
                transition={150}
              />
              {photo.state !== 'saved' && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t('listingForm.notUploaded')}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}
      {preparing ? (
        <View style={styles.inline}>
          <ActivityIndicator />
          <Text style={{ color: colors.textMuted }}>{t('listingForm.preparingPhotos')}</Text>
        </View>
      ) : (
        <View style={styles.pair}>
          <Button
            title={t('listingForm.addFromLibrary')}
            variant="secondary"
            disabled={slots === 0}
            onPress={() => void add('library')}
            style={styles.grow}
          />
          <Button
            title={t('listingForm.takePhoto')}
            variant="secondary"
            disabled={slots === 0}
            onPress={() => void add('camera')}
            style={styles.grow}
          />
        </View>
      )}
      {message && <Text style={[styles.body, { color: colors.danger }]}>{message}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 28, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, padding: 14, gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  list: { gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbBox: { width: '31.5%', aspectRatio: 1 },
  thumb: { width: '100%', height: '100%', borderRadius: 8 },
  badge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
