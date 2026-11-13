'use client';

import { DISTRICTS, SEARCH_LIMITS } from '@bairmair/db';
import { createTranslator, type Locale } from '@bairmair/i18n';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  hasFilters,
  parseSearchParams,
  searchQuery,
  type RawSearchParams,
  type SearchFilters,
} from '@bairmair/browse';

const ROOM_CHIPS = Array.from({ length: SEARCH_LIMITS.roomsPlus }, (_, index) => index + 1);

/**
 * The search filters. A plain GET form, so it works before JavaScript loads; with JavaScript the
 * URL is rebuilt without empty fields and the page navigates on the client.
 */
export function SearchForm({
  locale,
  filters,
  action,
}: {
  locale: Locale;
  filters: SearchFilters;
  /** The search page's path for this locale. */
  action: string;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The price unit follows the currency picked, before the form is sent.
  const [currency, setCurrency] = useState(filters.currency);
  const usd = currency === 'USD';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const raw: RawSearchParams = {};
    for (const key of new Set(data.keys())) {
      raw[key] = data.getAll(key).filter((value): value is string => typeof value === 'string');
    }
    router.push(`${action}${searchQuery(parseSearchParams(raw))}`);
    setOpen(false);
  };

  const cleared = searchQuery({ ...parseSearchParams({}), type: filters.type, view: filters.view });

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="w-full rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium lg:hidden"
      >
        {t('search.filters')}
        {hasFilters(filters) ? ' •' : ''}
      </button>

      <form
        method="get"
        action={action}
        onSubmit={submit}
        className={`${open ? 'mt-3 block' : 'hidden'} space-y-5 rounded-2xl bg-white p-4 shadow-sm lg:block`}
      >
        {filters.type && <input type="hidden" name="type" value={filters.type} />}
        {filters.view === 'map' && <input type="hidden" name="view" value="map" />}
        {filters.sort !== 'recommended' && <input type="hidden" name="sort" value={filters.sort} />}

        <Field label={t('search.query')} htmlFor="search-q">
          <input
            id="search-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder={t('search.queryPlaceholder')}
            maxLength={100}
            className={inputClass}
          />
        </Field>

        <fieldset>
          <legend className={legendClass}>{t('search.districts')}</legend>
          <div className="flex flex-wrap gap-2">
            {DISTRICTS.map((district) => (
              <Chip
                key={district.slug}
                name="district"
                value={district.slug}
                checked={filters.districts.includes(district.slug)}
              >
                {locale === 'mn' ? district.nameMn : district.nameEn}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={legendClass}>{t('search.rooms')}</legend>
          <div className="flex flex-wrap gap-2">
            {ROOM_CHIPS.map((rooms) => (
              <Chip
                key={rooms}
                name="rooms"
                value={String(rooms)}
                checked={filters.rooms.includes(rooms)}
              >
                {rooms === SEARCH_LIMITS.roomsPlus
                  ? t('search.roomsPlus', { count: rooms })
                  : String(rooms)}
              </Chip>
            ))}
          </div>
        </fieldset>

        {filters.type !== 'sale' && (
          <Field label={t('search.currency')} htmlFor="search-currency">
            <select
              id="search-currency"
              name="currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value === 'USD' ? 'USD' : 'MNT')}
              className={inputClass}
            >
              <option value="MNT">₮ MNT</option>
              <option value="USD">$ USD</option>
            </select>
            <p className="mt-1 text-xs text-stone-500">{t('search.currencyNote')}</p>
          </Field>
        )}

        <Range
          label={usd ? t('search.priceUsd') : t('search.priceMnt')}
          name="price"
          min={filters.priceMin}
          max={filters.priceMax}
          minLabel={t('search.min')}
          maxLabel={t('search.max')}
        />
        <Range
          label={t('search.area')}
          name="area"
          min={filters.areaMin}
          max={filters.areaMax}
          minLabel={t('search.min')}
          maxLabel={t('search.max')}
        />

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="has3d"
            value="1"
            defaultChecked={filters.has3d}
            className="size-4 accent-stone-900"
          />
          {t('search.has3d')}
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="flex-1 rounded-full bg-stone-900 px-5 py-2.5 font-medium text-white hover:bg-stone-700"
          >
            {t('search.submit')}
          </button>
          {hasFilters(filters) && (
            <a href={`${action}${cleared}`} className="text-sm text-stone-600 hover:underline">
              {t('search.reset')}
            </a>
          )}
        </div>
      </form>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-900 focus:outline-none';
const legendClass = 'mb-2 text-sm font-medium text-stone-700';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={`block ${legendClass}`}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Chip({
  name,
  value,
  checked,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  children: ReactNode;
}) {
  return (
    <label className="cursor-pointer rounded-full border border-stone-300 px-3 py-1 text-sm has-checked:border-stone-900 has-checked:bg-stone-900 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-amber-400">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="sr-only"
      />
      {children}
    </label>
  );
}

function Range({
  label,
  name,
  min,
  max,
  minLabel,
  maxLabel,
}: {
  label: string;
  name: 'price' | 'area';
  min: number | null;
  max: number | null;
  minLabel: string;
  maxLabel: string;
}) {
  return (
    <fieldset>
      <legend className={legendClass}>{label}</legend>
      <div className="flex items-center gap-2">
        <input
          name={`${name}Min`}
          inputMode="decimal"
          aria-label={`${label}: ${minLabel}`}
          placeholder={minLabel}
          defaultValue={min ?? ''}
          className={inputClass}
        />
        <span className="text-stone-400">–</span>
        <input
          name={`${name}Max`}
          inputMode="decimal"
          aria-label={`${label}: ${maxLabel}`}
          placeholder={maxLabel}
          defaultValue={max ?? ''}
          className={inputClass}
        />
      </div>
    </fieldset>
  );
}
