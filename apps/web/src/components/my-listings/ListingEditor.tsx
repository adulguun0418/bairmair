'use client';

import {
  EMPTY_FORM,
  formFromRow,
  formToFields,
  missingForPublish,
  privateUnitNumber,
  type FormErrors,
  type FormField,
  type ListingForm,
} from '@bairmair/browse';
import { Constants, DISTRICTS } from '@bairmair/db';
import { createTranslator, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInHref } from '@/components/auth/HeaderAuthLinks';
import { PinPicker } from '@/components/map/maps';
import {
  deleteMyListing,
  loadMyListing,
  saveListingFields,
  savePrivate,
  type MyListingRow,
  type MyPhoto,
} from '@/lib/my-listings';
import { PhotoSection } from './PhotoSection';
import { StatusSection } from './StatusSection';

type Pin = { lat: number; lng: number };
type Translate = ReturnType<typeof createTranslator>;

interface Loaded {
  row: MyListingRow | null;
  form: ListingForm;
  pin: Pin | null;
  photos: MyPhoto[];
}

const samePin = (a: Pin | null, b: Pin | null) =>
  a === b || (a !== null && b !== null && a.lat === b.lat && a.lng === b.lng);

/**
 * The website's listing editor: the app's form (same validation, `@bairmair/browse`
 * listing-form), a map pin, photos and publishing. Fields are saved with "Save"; photos and
 * status changes are saved at once. A new listing gets its id on the first save (in the
 * browser, kept for retries) and exists on the server from then on (a draft needs only a title).
 */
export function ListingEditor({ listingId, locale }: { listingId: string | null; locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  const { session, ready } = useAuth();
  const userId = session?.user.id ?? null;

  /** A new listing's id, made on its first save and kept if that save has to be retried. */
  const newId = useRef<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(
    listingId
      ? null
      : {
          row: null,
          form: EMPTY_FORM,
          pin: null,
          photos: [],
        },
  );
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState<ListingForm>(EMPTY_FORM);
  const [pin, setPin] = useState<Pin | null>(null);
  const [photos, setPhotos] = useState<MyPhoto[]>([]);
  const [row, setRow] = useState<MyListingRow | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (ready && !userId) {
      const path = localePath(locale, listingId ? `/my-listings/${listingId}` : '/my-listings/new');
      router.replace(signInHref(locale, path));
    }
  }, [ready, userId, listingId, locale, router]);

  // Load an existing listing.
  useEffect(() => {
    if (!listingId || !userId) return;
    let active = true;
    loadMyListing(listingId, userId)
      .then((listing) => {
        if (!active) return;
        if (!listing) {
          setMissing(true);
          return;
        }
        // Start editing from what was loaded.
        const form = formFromRow(listing.row, listing.unitNumber);
        setLoaded({ row: listing.row, form, pin: listing.pin, photos: listing.photos });
        setForm(form);
        setPin(listing.pin);
        setPhotos(listing.photos);
        setRow(listing.row);
      })
      .catch(() => active && setNotice({ text: t('browse.loadFailed'), error: true }));
    return () => {
      active = false;
    };
  }, [listingId, userId, t]);

  if (missing) return <p className="text-stone-600">{t('listingForm.notFound')}</p>;
  if (!ready || !userId || !loaded) {
    return <div className="h-96 animate-pulse rounded-2xl bg-stone-200" />;
  }

  const unsaved = JSON.stringify(form) !== JSON.stringify(loaded.form) || !samePin(pin, loaded.pin);
  const set = <K extends FormField>(field: K, value: ListingForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setNotice(null);
  };

  const save = async () => {
    const result = formToFields(form);
    setErrors(result.errors);
    if (!result.ok) {
      setNotice({ text: t('listingForm.requirements.validFields'), error: true });
      return;
    }
    const unit = privateUnitNumber(form);
    if (unit && !pin) {
      setNotice({ text: t('listingForm.pinNeededForUnit'), error: true });
      return;
    }
    setBusy(true);
    setNotice(null);
    const id = listingId ?? row?.id ?? (newId.current ??= crypto.randomUUID());
    try {
      const saved = await saveListingFields(id, result.fields, row === null);
      if (pin && (!samePin(pin, loaded.pin) || unit !== privateUnitNumber(loaded.form))) {
        await savePrivate(id, pin, unit);
      }
      setLoaded({ row: saved, form, pin, photos });
      setNotice({ text: t('listingForm.saved'), error: false });
      if (!listingId) router.replace(localePath(locale, `/my-listings/${id}`));
    } catch {
      setNotice({ text: t('listingForm.saveFailed'), error: true });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!row) return;
    if (!window.confirm(`${t('listingForm.deleteTitle')}\n\n${t('listingForm.deleteBodyWeb')}`)) {
      return;
    }
    setBusy(true);
    try {
      await deleteMyListing(row.id);
      router.push(localePath(locale, '/my-listings'));
    } catch {
      setNotice({ text: t('listingForm.saveFailed'), error: true });
      setBusy(false);
    }
  };

  const sale = form.type === 'sale';
  const requirements = missingForPublish({
    form: loaded.form,
    hasLocation: loaded.pin !== null,
    photoCount: photos.length,
    hasScannedArea: row?.area_scanned_m2 !== null && row?.area_scanned_m2 !== undefined,
  });
  const phoneVerified = Boolean(session?.user.phone && session.user.phone_confirmed_at);
  const field = { form, errors, set, t };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {row ? t('listingForm.editTitle') : t('listingForm.newTitle')}
        </h1>
        {row?.status === 'published' && (
          <Link href={localePath(locale, `/listings/${row.id}`)} className="text-sm underline">
            {t('listingForm.viewListing')}
          </Link>
        )}
      </div>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Section title={t('listingForm.sections.type')}>
          <Choice
            value={form.type}
            options={(['sale', 'rent'] as const).map((value) => ({
              value,
              label: t(`listingForm.types.${value}`),
            }))}
            onChange={(value) => set('type', value)}
          />
        </Section>

        <Section title={t('listingForm.sections.basics')}>
          <Text
            {...field}
            name="title"
            label={t('listingForm.title')}
            placeholder={t('listingForm.titlePlaceholder')}
          />
          <Text
            {...field}
            name="description"
            label={t('listingForm.description')}
            placeholder={t('listingForm.descriptionPlaceholder')}
            multiline
          />
        </Section>

        <Section title={t('listingForm.sections.price')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Text
              {...field}
              name="price"
              label={sale ? t('listingForm.price') : t('listingForm.priceRent')}
              numeric
            />
            {!sale && (
              <Labeled label={t('listingForm.currency')}>
                <Choice
                  value={form.currency}
                  options={(['MNT', 'USD'] as const).map((value) => ({
                    value,
                    label: value === 'MNT' ? '₮' : '$',
                  }))}
                  onChange={(value) => set('currency', value)}
                />
              </Labeled>
            )}
          </div>
          <Check
            label={t('listingForm.negotiable')}
            checked={form.negotiable}
            onChange={(value) => set('negotiable', value)}
          />
          {sale ? (
            <YesNo
              label={t('listingForm.mortgage')}
              value={form.mortgageEligible}
              onChange={(value) => set('mortgageEligible', value)}
              t={t}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Text {...field} name="deposit" label={t('listingForm.deposit')} numeric />
              <Text {...field} name="minTermMonths" label={t('listingForm.minTerm')} numeric />
              <YesNo
                label={t('listingForm.utilities')}
                value={form.utilitiesIncluded}
                onChange={(value) => set('utilitiesIncluded', value)}
                t={t}
              />
            </div>
          )}
        </Section>

        <Section title={t('listingForm.sections.property')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Text
              {...field}
              name="rooms"
              label={t('listingForm.rooms')}
              hint={t('listingForm.roomsHint')}
              numeric
            />
            <Text
              {...field}
              name="areaOfficial"
              label={t('listingForm.area')}
              hint={t('listingForm.areaHint')}
              numeric
            />
            <Text {...field} name="floor" label={t('listingForm.floor')} numeric />
            <Text {...field} name="totalFloors" label={t('listingForm.totalFloors')} numeric />
            <Text {...field} name="buildingYear" label={t('listingForm.buildingYear')} numeric />
            <Text {...field} name="balconies" label={t('listingForm.balconies')} numeric />
          </div>
          <Labeled label={t('listingForm.material')}>
            <Choice
              value={form.buildingMaterial}
              options={Constants.public.Enums.building_material.map((value) => ({
                value,
                label: t(`listingForm.materials.${value}`),
              }))}
              onChange={(value) => set('buildingMaterial', value)}
              clearable
            />
          </Labeled>
          <Check
            label={t('listingForm.newBuilding')}
            checked={form.newBuilding}
            onChange={(value) => set('newBuilding', value)}
          />
          <Labeled label={t('listingForm.heating')}>
            <Choice
              value={form.heating}
              options={Constants.public.Enums.heating_type.map((value) => ({
                value,
                label: t(`listingForm.heatings.${value}`),
              }))}
              onChange={(value) => set('heating', value)}
              clearable
            />
          </Labeled>
          <Labeled label={t('listingForm.parking')}>
            <Choice
              value={form.parking}
              options={Constants.public.Enums.parking_type.map((value) => ({
                value,
                label: t(`listingForm.parkings.${value}`),
              }))}
              onChange={(value) => set('parking', value)}
              clearable
            />
          </Labeled>
          <Labeled label={t('listingForm.furnishing')}>
            <Choice
              value={form.furnishing}
              options={Constants.public.Enums.furnishing.map((value) => ({
                value,
                label: t(`listingForm.furnishings.${value}`),
              }))}
              onChange={(value) => set('furnishing', value)}
              clearable
            />
          </Labeled>
        </Section>

        <Section title={t('listingForm.sections.location')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label={t('listingForm.district')}>
              <select
                value={form.districtId ?? ''}
                onChange={(event) =>
                  set('districtId', event.target.value === '' ? null : Number(event.target.value))
                }
                className={inputClass}
              >
                <option value="">—</option>
                {DISTRICTS.map((district) => (
                  <option key={district.id} value={district.id}>
                    {locale === 'mn' ? district.nameMn : district.nameEn}
                  </option>
                ))}
              </select>
            </Labeled>
            <Text {...field} name="khoroo" label={t('listingForm.khoroo')} numeric />
          </div>
          <Text
            {...field}
            name="complexName"
            label={t('listingForm.complexName')}
            placeholder={t('listingForm.complexPlaceholder')}
          />
          <Text
            {...field}
            name="addressText"
            label={t('listingForm.addressText')}
            placeholder={t('listingForm.addressPlaceholder')}
            multiline
          />
          <Labeled label={t('listingForm.pin')}>
            <p className="text-sm text-stone-600">{t('listingForm.pinWeb')}</p>
            <PinPicker
              pin={pin}
              locale={locale}
              onChange={(next) => {
                setPin(next);
                setNotice(null);
              }}
            />
            {!pin && <p className="text-sm text-stone-500">{t('listingForm.notPinned')}</p>}
          </Labeled>
          <Check
            label={t('listingForm.showExact')}
            hint={t('listingForm.showExactHint')}
            checked={form.showExactLocation}
            onChange={(value) => set('showExactLocation', value)}
          />
          <Text
            {...field}
            name="unitNumber"
            label={t('listingForm.unitNumber')}
            hint={t('listingForm.unitHint')}
          />
        </Section>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-stone-50/95 px-4 py-3">
          <button
            type="submit"
            disabled={busy || (row !== null && !unsaved)}
            className="rounded-full bg-stone-900 px-5 py-2.5 font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? t('listingForm.saving') : t('listingForm.save')}
          </button>
          {unsaved && !notice && (
            <span className="text-sm text-amber-800">{t('listingForm.unsaved')}</span>
          )}
          {notice && (
            <span
              role={notice.error ? 'alert' : 'status'}
              className={`text-sm ${notice.error ? 'text-red-700' : 'text-emerald-700'}`}
            >
              {notice.text}
            </span>
          )}
        </div>
      </form>

      <Section title={t('listingForm.sections.photos')}>
        <PhotoSection
          listingId={row?.id ?? null}
          photos={photos}
          onChange={setPhotos}
          locale={locale}
        />
      </Section>

      <Section title={t('listingForm.sections.scan')}>
        <p className="text-sm text-stone-600">
          {row?.has_3d ? `${t('listingForm.scanDone')} ` : ''}
          {t('listingForm.scanInApp')}
        </p>
      </Section>

      {row && (
        <Section title={t('listingForm.sections.publish')}>
          <StatusSection
            row={row}
            missing={requirements}
            phoneVerified={phoneVerified}
            unsaved={unsaved}
            onRow={(next) => {
              setRow(next);
              setLoaded((current) => (current ? { ...current, row: next } : current));
            }}
            locale={locale}
          />
        </Section>
      )}

      {row && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="text-sm text-red-700 underline disabled:opacity-50"
        >
          {t('listingForm.delete')}
        </button>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-stone-900';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

/** A text or number input bound to a form field, with its validation message. */
function Text({
  form,
  errors,
  set,
  t,
  name,
  label,
  placeholder,
  hint,
  numeric = false,
  multiline = false,
}: {
  form: ListingForm;
  errors: FormErrors;
  set: (field: FormField, value: string) => void;
  t: Translate;
  name: FormField;
  label: string;
  placeholder?: string;
  hint?: string;
  numeric?: boolean;
  multiline?: boolean;
}) {
  const value = form[name] as string;
  const error = errors[name];
  const props = {
    value,
    placeholder,
    'aria-invalid': error ? true : undefined,
    className: `${inputClass} ${error ? 'border-red-500' : ''}`,
  };
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {multiline ? (
        <textarea {...props} rows={4} onChange={(event) => set(name, event.target.value)} />
      ) : (
        <input
          {...props}
          inputMode={numeric ? 'decimal' : undefined}
          onChange={(event) => set(name, event.target.value)}
        />
      )}
      {hint && !error && <span className="block text-xs text-stone-500">{hint}</span>}
      {error && (
        <span className="block text-sm text-red-700">{t(`listingForm.errors.${error}`)}</span>
      )}
    </label>
  );
}

/** Buttons for one choice; `clearable` lets the seller go back to "not given". */
function Choice<T extends string>({
  value,
  options,
  onChange,
  clearable = false,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  clearable?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() =>
              selected && clearable ? onChange(null as unknown as T) : onChange(option.value)
            }
            className={`rounded-full border px-3 py-1.5 text-sm ${
              selected
                ? 'border-stone-900 bg-stone-900 text-white'
                : 'border-stone-300 hover:bg-stone-50'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

/** Yes / no / not given. */
function YesNo({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  t: Translate;
}) {
  return (
    <Labeled label={label}>
      <Choice
        value={value === null ? null : value ? 'yes' : 'no'}
        options={[
          { value: 'yes' as const, label: t('listingForm.yes') },
          { value: 'no' as const, label: t('listingForm.no') },
        ]}
        onChange={(choice) => onChange(choice === null ? null : choice === 'yes')}
        clearable
      />
    </Labeled>
  );
}
