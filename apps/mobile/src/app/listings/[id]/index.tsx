import { DISTRICTS, LISTING_LIMITS } from '@bairmair/db';
import { formatMoney, formatMoneyCompact } from '@bairmair/i18n';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type TextInputProps,
} from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { formToFields, parseNumberInput, type FormField, type ListingForm } from '@bairmair/browse';
import { StepCard, StepMarker } from '@/listings/editor-step';
import {
  editorProgress,
  editorSteps,
  type EditorStep,
  type EditorStepId,
} from '@/listings/editor-steps';
import {
  addPickedPhotos,
  deleteListing,
  discardIfUntouched,
  editListing,
  photoUri,
  refreshFromServer,
  removeListingPhoto,
  useLocalListing,
} from '@/listings/listings';
import { locateHere, type LocateResult } from '@/listings/location';
import {
  isLive,
  movePhoto,
  photoSlotsLeft,
  setLocation,
  updateForm,
  type LocalListing,
  type LocalPhoto,
} from '@/listings/model';
import { pickFromLibrary, takePhoto } from '@/listings/photos';
import { ScanSection } from '@/listings/scan-section';
import { StatusPill } from '@/listings/status-pill';
import { StatusSection } from '@/listings/status-section';
import { SyncStatusLine } from '@/listings/sync-status-line';
import { Button } from '@/ui/button';
import { ChoiceChips } from '@/ui/choice-chips';
import { Icon } from '@/ui/icon';
import { ProgressBar } from '@/ui/progress-bar';
import { ScrollLockHost } from '@/ui/scroll-lock';
import { TextField } from '@/ui/text-field';
import { radius, useColors } from '@/ui/theme';
import { ToggleRow } from '@/ui/toggle-row';
import { Text } from '@/ui/text';

const nowIso = () => new Date().toISOString();

/** Loaded on first use, like the other maps (MapLibre's native module). */
const LocationMap = lazy(() =>
  import('@/browse/location-map').then((module) => ({ default: module.LocationMap })),
);

/** The editor checks the server again when reopened after this long. */
const EDITOR_REFRESH_MS = 5_000;

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

  // Takes the server's version if it changed elsewhere (the website) and nothing here is unsent.
  useFocusEffect(
    useCallback(() => {
      void refreshFromServer({ ids: [id], maxAgeMs: EDITOR_REFRESH_MS });
    }, [id]),
  );

  if (!listing || listing.deleted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted }}>{t('listingForm.notFound')}</Text>
      </View>
    );
  }
  return <Editor listing={listing} />;
}

/**
 * The listing as steps (basics, price, apartment, location, photos, optional 3D scan, publish),
 * under a header with the status, progress towards publishing and a row of steps to jump to.
 */
function Editor({ listing }: { listing: LocalListing }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const id = listing.id;
  const form = listing.form;
  const { errors } = formToFields(form);
  const sale = form.type === 'sale';
  const currency = sale ? 'MNT' : form.currency;

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Pull to refresh: takes edits made on the website, unless something here is still unsent. */
  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshFromServer({ ids: [id], maxAgeMs: 0 });
    } finally {
      setRefreshing(false);
    }
  };
  /** Where each step starts in the scroll content, for the header's step row. */
  const offsets = useRef<Partial<Record<EditorStepId, number>>>({});
  const steps = editorSteps(listing);
  const stepOf = (stepId: EditorStepId) => steps.find((step) => step.id === stepId)!;
  const numberOf = (stepId: EditorStepId) => steps.findIndex((step) => step.id === stepId) + 1;
  const place = (stepId: EditorStepId) => (event: LayoutChangeEvent) => {
    offsets.current[stepId] = event.nativeEvent.layout.y;
  };
  const jump = (stepId: EditorStepId) =>
    scrollRef.current?.scrollTo({
      y: Math.max(0, (offsets.current[stepId] ?? 0) - 12),
      animated: true,
    });
  const stepProps = (stepId: EditorStepId) => ({
    number: numberOf(stepId),
    step: stepOf(stepId),
    onLayout: place(stepId),
  });

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
    <ScrollLockHost>
      {(scrollEnabled) => (
        <ScrollView
          ref={scrollRef}
          scrollEnabled={scrollEnabled}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
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
          <EditorHeader listing={listing} steps={steps} onJump={jump} />

          <StepCard {...stepProps('basics')}>
            <ChoiceChips
              label={t('listingForm.sections.type')}
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
          </StepCard>

          <StepCard {...stepProps('price')}>
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
                {field(
                  'deposit',
                  `${t('listingForm.deposit')} (${currency === 'USD' ? '$' : '₮'})`,
                  {
                    keyboardType: 'number-pad',
                    maxLength: 20,
                  },
                )}
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
          </StepCard>

          <StepCard {...stepProps('property')}>
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
            <View style={styles.pair}>
              <View style={styles.grow}>
                {field('buildingYear', t('listingForm.buildingYear'), {
                  keyboardType: 'number-pad',
                  maxLength: 4,
                })}
              </View>
              <View style={styles.grow}>
                {field('balconies', t('listingForm.balconies'), {
                  keyboardType: 'number-pad',
                  maxLength: 2,
                })}
              </View>
            </View>
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
          </StepCard>

          <StepCard {...stepProps('location')}>
            <ChoiceChips
              label={t('listingForm.district')}
              choices={DISTRICTS.map((district) => ({
                value: district.id,
                label: locale === 'mn' ? district.nameMn : district.nameEn,
              }))}
              value={form.districtId}
              onChange={(districtId) => set({ districtId })}
            />
            <View style={styles.pair}>
              <View style={styles.narrow}>
                {field('khoroo', t('listingForm.khoroo'), {
                  keyboardType: 'number-pad',
                  maxLength: 2,
                })}
              </View>
              <View style={styles.grow}>
                {field('complexName', t('listingForm.complexName'), {
                  placeholder: t('listingForm.complexPlaceholder'),
                  maxLength: LISTING_LIMITS.complexName.max,
                })}
              </View>
            </View>
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
          </StepCard>

          <StepCard {...stepProps('photos')}>
            <Photos listing={listing} />
          </StepCard>

          <StepCard {...stepProps('scan')}>
            <ScanSection listing={listing} />
          </StepCard>

          <StepCard {...stepProps('publish')}>
            <StatusSection listing={listing} />
          </StepCard>

          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            style={({ pressed }) => [styles.deleteRow, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon name="trash" size={16} color={colors.danger} />
            <Text style={[styles.body, { color: colors.danger }]}>{t('listingForm.delete')}</Text>
          </Pressable>
        </ScrollView>
      )}
    </ScrollLockHost>
  );
}

/**
 * Where the listing stands: status (and 3D) as the server has it, progress towards publishing
 * (not once live), the steps as a row to jump to, and whether the phone's copy is sent.
 */
function EditorHeader({
  listing,
  steps,
  onJump,
}: {
  listing: LocalListing;
  steps: EditorStep[];
  onJump: (step: EditorStepId) => void;
}) {
  const { t } = useI18n();
  const colors = useColors();
  const live = isLive(listing.serverStatus);
  const progress = editorProgress(steps);
  const ready = progress.done === progress.total;

  return (
    <View
      style={[
        styles.header,
        { backgroundColor: colors.surface, boxShadow: `0 2px 10px ${colors.shadow}` },
      ]}
    >
      <View style={styles.headerTop}>
        <StatusPill status={listing.serverStatus} />
        {listing.scan?.processing === 'ready' && (
          <View style={[styles.badge3d, { backgroundColor: colors.ink }]}>
            <Icon name="cube" size={12} color={colors.onInk} weight="semibold" />
            <Text style={[styles.badge3dText, { color: colors.onInk }]}>
              {t('listings.badge3d')}
            </Text>
          </View>
        )}
      </View>
      {!live && (
        <View style={styles.progress}>
          <Text style={[styles.progressText, { color: ready ? colors.success : colors.text }]}>
            {ready ? t('seller.editor.progressReady') : t('seller.editor.progress', progress)}
          </Text>
          <ProgressBar
            value={progress.done / progress.total}
            color={ready ? colors.success : undefined}
          />
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stepRow}
      >
        {steps.map((step, index) => {
          const label = t(`seller.editor.steps.${step.id}`);
          return (
            <Pressable
              key={step.id}
              accessibilityRole="button"
              accessibilityLabel={t('seller.editor.jump', { step: label })}
              onPress={() => onJump(step.id)}
              style={({ pressed }) => [
                styles.stepChip,
                { backgroundColor: colors.surface2, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <StepMarker number={index + 1} state={step.state} size={20} />
              <Text style={[styles.stepChipText, { color: colors.textSecondary }]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <SyncStatusLine listing={listing} />
    </View>
  );
}

function LocationPin({ listing }: { listing: LocalListing }) {
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
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
    <View style={[styles.subPanel, { backgroundColor: colors.surface2 }]}>
      <View style={styles.inlineHead}>
        <Icon name="pin" size={16} color={location ? colors.success : colors.brand} />
        <Text style={[styles.label, { color: colors.text }]}>{t('listingForm.pin')}</Text>
      </View>
      <Text style={[styles.body, { color: location ? colors.success : colors.textSecondary }]}>
        {location
          ? location.accuracyM !== null
            ? t('listingForm.pinned', { meters: location.accuracyM })
            : t('listingForm.pinnedNoAccuracy')
          : t('listingForm.notPinned')}
      </Text>
      {location && (
        <Suspense fallback={<ActivityIndicator />}>
          <LocationMap lat={location.lat} lng={location.lng} exact />
        </Suspense>
      )}
      <Text style={[styles.small, { color: colors.textMuted }]}>{t('listingForm.pinHint')}</Text>
      <Button
        title={location ? t('listingForm.moveOnMap') : t('listingForm.pickOnMap')}
        icon="map"
        variant={location ? 'outline' : 'primary'}
        onPress={() => router.push({ pathname: '/listings/[id]/pin', params: { id: listing.id } })}
      />
      {locating ? (
        <View style={styles.inline}>
          <ActivityIndicator />
          <Text style={{ color: colors.textMuted }}>{t('listingForm.locating')}</Text>
        </View>
      ) : (
        <Button
          title={t('listingForm.useCurrentLocation')}
          icon="pin"
          variant="outline"
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
                style={[styles.thumb, { backgroundColor: colors.surface2 }]}
                contentFit="cover"
                transition={150}
              />
              {index === 0 && (
                <View style={[styles.coverTag, { backgroundColor: colors.ink }]}>
                  <Text style={[styles.badgeText, { color: colors.onInk }]}>
                    {t('listingForm.photoActions.cover')}
                  </Text>
                </View>
              )}
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
            icon="photos"
            variant={listing.photos.length === 0 ? 'primary' : 'secondary'}
            disabled={slots === 0}
            onPress={() => void add('library')}
            style={styles.grow}
          />
          <Button
            title={t('listingForm.takePhoto')}
            icon="camera"
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
  header: { borderRadius: radius.lg, padding: 16, gap: 14 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge3d: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badge3dText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  progress: { gap: 8 },
  progressText: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 },
  stepRow: { gap: 8 },
  stepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 5,
    paddingRight: 12,
    height: 32,
    borderRadius: radius.pill,
  },
  stepChipText: { fontSize: 13, fontWeight: '600' },
  subPanel: { borderRadius: radius.md, padding: 14, gap: 10 },
  inlineHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
  narrow: { width: 96 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbBox: { width: '31.5%', aspectRatio: 1 },
  thumb: { width: '100%', height: '100%', borderRadius: radius.sm },
  coverTag: {
    position: 'absolute',
    left: 4,
    top: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
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
  deleteRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
});
