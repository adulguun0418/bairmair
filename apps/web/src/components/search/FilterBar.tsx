'use client';

import { DISTRICTS, SEARCH_LIMITS, SEARCH_SORTS, type SearchSort } from '@bairmair/db';
import { createTranslator, type Locale, type Translator } from '@bairmair/i18n';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  hasFilters,
  parseAmount,
  searchQuery,
  type SearchFilters,
} from '@bairmair/browse';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from '@/components/header/use-dismiss';
import { ChevronDownIcon, CloseIcon, CubeIcon, SearchIcon } from '@/components/icons';
import { areaLabel, districtsLabel, priceLabel, roomsLabel } from '@/lib/search-pills';
import { useResultCount, useSearchNavigation } from './search-navigation';

const ROOM_CHIPS = Array.from({ length: SEARCH_LIMITS.roomsPlus }, (_, index) => index + 1);

/**
 * The search page's filters, above the results. On wide screens each filter is a pill with its
 * own panel: districts, rooms, 3D and sort apply at once; price and area apply from their panel,
 * whose button says how many listings it will show. On phones all filters open in a sheet.
 * The text search and buy/rent/all sit on the first row.
 */
export function FilterBar({
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
  const { navigate } = useSearchNavigation();
  const go = (changes: Partial<SearchFilters>) =>
    navigate(`${action}${searchQuery(filters, changes)}`);
  const [sheetOpen, setSheetOpen] = useState(false);
  const count = activeFilterCount(filters);
  const cleared: Partial<SearchFilters> = {
    ...DEFAULT_FILTERS,
    type: filters.type,
    sort: filters.sort,
    view: filters.view,
  };

  const submitQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q');
    go({ q: typeof q === 'string' ? q.trim().slice(0, 100) : '' });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
        <nav
          aria-label={t('search.title')}
          className="inline-flex shrink-0 rounded-full bg-surface-3 p-1"
        >
          {([null, 'sale', 'rent'] as const).map((type) => (
            <button
              key={type ?? 'all'}
              type="button"
              aria-pressed={filters.type === type}
              onClick={() => go({ type, currency: type === 'sale' ? 'MNT' : filters.currency })}
              className={`rounded-full px-3.5 py-1.5 text-sm transition sm:px-4 ${
                filters.type === type
                  ? 'bg-surface font-medium shadow-sm'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {t(`search.types.${type ?? 'all'}`)}
            </button>
          ))}
        </nav>

        {/* GET form: works before JavaScript loads, keeping the other filters. */}
        <form
          role="search"
          method="get"
          action={action}
          onSubmit={submitQuery}
          className="relative order-last w-full sm:order-none sm:max-w-md sm:flex-1"
        >
          <HiddenFilters filters={filters} omit="q" />
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle" />
          <input
            key={filters.q}
            name="q"
            type="search"
            defaultValue={filters.q}
            maxLength={100}
            aria-label={t('search.query')}
            placeholder={t('search.queryPlaceholder')}
            className="h-10 w-full rounded-full bg-surface pl-10 pr-4 text-sm ring-1 ring-line outline-none transition focus:ring-2 focus:ring-accent"
          />
        </form>

        <nav className="ml-auto inline-flex shrink-0 rounded-full bg-surface p-1 ring-1 ring-line">
          {(['list', 'map'] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={filters.view === view}
              onClick={() => go({ view, page: filters.page })}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                filters.view === view
                  ? 'bg-primary font-medium text-on-primary'
                  : 'text-fg-2 hover:text-fg'
              }`}
            >
              {t(`search.views.${view}`)}
            </button>
          ))}
        </nav>
      </div>

      {/* Wide screens: one pill per filter. */}
      <div className="hidden items-center gap-2 md:flex">
        <Pill label={t('search.districts')} value={districtsLabel(filters, locale)}>
          {() => (
            <ChipGroup
              key={filters.districts.join()}
              options={DISTRICTS.map((district) => ({
                value: district.slug,
                label: locale === 'mn' ? district.nameMn : district.nameEn,
              }))}
              selected={filters.districts}
              onChange={(districts) => go({ districts })}
              wide
            />
          )}
        </Pill>
        <Pill label={t('search.rooms')} value={roomsLabel(filters, t)}>
          {() => (
            <ChipGroup
              key={filters.rooms.join()}
              options={ROOM_CHIPS.map((rooms) => ({
                value: rooms,
                label: rooms === SEARCH_LIMITS.roomsPlus ? `${rooms}+` : String(rooms),
              }))}
              selected={filters.rooms}
              onChange={(rooms) => go({ rooms })}
            />
          )}
        </Pill>
        <Pill label={t('search.price')} value={priceLabel(filters, t)}>
          {(close) => (
            <RangePanel
              t={t}
              filters={filters}
              kind="price"
              onApply={(changes) => {
                go(changes);
                close();
              }}
            />
          )}
        </Pill>
        <Pill label={t('search.areaShort')} value={areaLabel(filters)}>
          {(close) => (
            <RangePanel
              t={t}
              filters={filters}
              kind="area"
              onApply={(changes) => {
                go(changes);
                close();
              }}
            />
          )}
        </Pill>
        <button
          type="button"
          aria-pressed={filters.has3d}
          onClick={() => go({ has3d: !filters.has3d })}
          className={`${pillClass} ${filters.has3d ? pillActiveClass : ''}`}
        >
          <CubeIcon className="size-4" />
          {t('search.has3d')}
        </button>
        {filters.bounds && (
          <button
            type="button"
            onClick={() => go({ bounds: null })}
            aria-label={t('search.removeMapArea')}
            className={`${pillClass} ${pillActiveClass}`}
          >
            {t('search.mapArea')}
            <CloseIcon className="size-3.5" />
          </button>
        )}
        {hasFilters(filters) && (
          <button
            type="button"
            onClick={() => go(cleared)}
            className="rounded-full px-3 py-1.5 text-sm text-fg-muted hover:text-fg hover:underline"
          >
            {t('search.clearAll')}
          </button>
        )}
        <div className="ml-auto">
          <SortSelect t={t} value={filters.sort} onChange={(sort) => go({ sort })} />
        </div>
      </div>

      {/* Phones: one button for every filter, and the sort. */}
      <div className="flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`${pillClass} ${count > 0 || filters.bounds ? pillActiveClass : ''}`}
        >
          {t('search.filters')}
          {count > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-on-primary">
              {count}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-pressed={filters.has3d}
          onClick={() => go({ has3d: !filters.has3d })}
          className={`${pillClass} ${filters.has3d ? pillActiveClass : ''}`}
        >
          <CubeIcon className="size-4" />
          {t('search.has3dShort')}
        </button>
        <div className="ml-auto">
          <SortSelect t={t} value={filters.sort} onChange={(sort) => go({ sort })} />
        </div>
      </div>

      {sheetOpen && (
        <FilterSheet
          locale={locale}
          t={t}
          filters={filters}
          cleared={cleared}
          onClose={() => setSheetOpen(false)}
          onApply={(next) => {
            navigate(`${action}${searchQuery(next)}`);
            setSheetOpen(false);
          }}
        />
      )}
    </div>
  );
}

const pillClass =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm ring-1 ring-line transition hover:ring-line-2';
const pillActiveClass = 'bg-accent-subtle font-medium text-on-accent-soft ring-accent/40';

/** A filter pill with a panel underneath. `children` gets a function that closes the panel. */
function Pill({
  label,
  value,
  children,
}: {
  label: string;
  /** What is set, or null. */
  value: string | null;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(open, close, ref);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`${pillClass} ${value ? pillActiveClass : ''} ${open ? 'ring-2 ring-accent' : ''}`}
      >
        <span className="max-w-48 truncate">{value ?? label}</span>
        <ChevronDownIcon className={`size-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 rounded-2xl bg-surface p-4 shadow-2xl shadow-primary/10 ring-1 ring-line">
          {children(close)}
        </div>
      )}
    </div>
  );
}

/** Toggle chips that report every change (the parent applies it at once or keeps a draft). */
function ChipGroup<T extends string | number>({
  options,
  selected,
  onChange,
  wide = false,
}: {
  options: { value: T; label: string }[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  /** Several columns (districts). */
  wide?: boolean;
}) {
  // Shown at once, before the new results arrive.
  const [current, setCurrent] = useState<readonly T[]>(selected);
  const toggle = (value: T) => {
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : options
          .map((option) => option.value)
          .filter((item) => item === value || current.includes(item));
    setCurrent(next);
    onChange(next);
  };
  return (
    <div className={wide ? 'grid w-full grid-cols-2 gap-2 md:w-[22rem]' : 'flex gap-2'}>
      {options.map((option) => {
        const on = current.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(option.value)}
            className={`rounded-xl px-3 py-2 text-sm ring-1 transition ${wide ? 'text-left' : 'min-w-11'} ${
              on
                ? 'bg-primary font-medium text-on-primary ring-primary'
                : 'bg-surface ring-line hover:ring-line-2'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type RangeChanges = Pick<
  SearchFilters,
  'priceMin' | 'priceMax' | 'areaMin' | 'areaMax' | 'currency'
>;

/** Min and max (and the currency for rents), applied by a button that shows the result count. */
function RangePanel({
  t,
  filters,
  kind,
  onApply,
}: {
  t: Translator;
  filters: SearchFilters;
  kind: 'price' | 'area';
  onApply: (changes: Partial<RangeChanges>) => void;
}) {
  const price = kind === 'price';
  const [currency, setCurrency] = useState(filters.currency);
  const [min, setMin] = useState(String((price ? filters.priceMin : filters.areaMin) ?? ''));
  const [max, setMax] = useState(String((price ? filters.priceMax : filters.areaMax) ?? ''));
  const changes: Partial<RangeChanges> = price
    ? { currency, priceMin: parseAmount(min), priceMax: parseAmount(max) }
    : { areaMin: parseAmount(min), areaMax: parseAmount(max) };
  const count = useResultCount({ ...filters, ...changes });
  const label = price
    ? currency === 'USD'
      ? t('search.priceUsd')
      : t('search.priceMnt')
    : t('search.area');

  return (
    <form
      className="w-72 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(changes);
      }}
    >
      {price && filters.type !== 'sale' && (
        <div className="inline-flex rounded-full bg-surface-3 p-1 text-sm">
          {(['MNT', 'USD'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={currency === value}
              onClick={() => setCurrency(value)}
              className={`rounded-full px-3 py-1 ${currency === value ? 'bg-surface font-medium shadow-sm' : 'text-fg-muted'}`}
            >
              {value === 'MNT' ? '₮ MNT' : '$ USD'}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm font-medium text-fg-2">{label}</p>
      <div className="flex items-center gap-2">
        <input
          inputMode="decimal"
          aria-label={`${label}: ${t('search.min')}`}
          placeholder={t('search.min')}
          value={min}
          onChange={(event) => setMin(event.target.value)}
          className={inputClass}
        />
        <span className="text-fg-subtle">–</span>
        <input
          inputMode="decimal"
          aria-label={`${label}: ${t('search.max')}`}
          placeholder={t('search.max')}
          value={max}
          onChange={(event) => setMax(event.target.value)}
          className={inputClass}
        />
      </div>
      {price && filters.type !== 'sale' && (
        <p className="text-xs text-fg-subtle">{t('search.currencyNote')}</p>
      )}
      <ShowButton t={t} count={count} />
    </form>
  );
}

const inputClass =
  'h-10 w-full min-w-0 rounded-xl bg-surface-2 px-3 text-sm outline-none ring-1 ring-transparent transition focus:bg-surface focus:ring-accent';

function ShowButton({ t, count }: { t: Translator; count: number | null }) {
  return (
    <button
      type="submit"
      className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition hover:bg-primary-hover"
    >
      {count === null ? t('search.counting') : t('search.showResults', { count })}
    </button>
  );
}

function SortSelect({
  t,
  value,
  onChange,
}: {
  t: Translator;
  value: SearchSort;
  onChange: (sort: SearchSort) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-fg-muted lg:inline">{t('search.sort')}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SearchSort)}
        aria-label={t('search.sort')}
        className="h-9 rounded-full bg-surface pl-3 pr-8 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
      >
        {SEARCH_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {t(`search.sorts.${sort}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The other filters as hidden fields, so the plain GET form keeps them. */
function HiddenFilters({ filters, omit }: { filters: SearchFilters; omit: 'q' }) {
  const params = new URLSearchParams(searchQuery(filters, { [omit]: DEFAULT_FILTERS[omit] }));
  return [...params.entries()].map(([name, value], index) => (
    <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
  ));
}

/**
 * Every filter in a sheet from the bottom of the screen (phones). Changes stay a draft until
 * "Show N listings"; the count follows the draft. Rendered into <body>: the sticky filter bar
 * blurs its backdrop, which would otherwise trap this fixed panel inside it.
 */
function FilterSheet({
  locale,
  t,
  filters,
  cleared,
  onClose,
  onApply,
}: {
  locale: Locale;
  t: Translator;
  filters: SearchFilters;
  cleared: Partial<SearchFilters>;
  onClose: () => void;
  onApply: (next: SearchFilters) => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [priceText, setPriceText] = useState({
    min: String(filters.priceMin ?? ''),
    max: String(filters.priceMax ?? ''),
  });
  const [areaText, setAreaText] = useState({
    min: String(filters.areaMin ?? ''),
    max: String(filters.areaMax ?? ''),
  });
  const next: SearchFilters = {
    ...draft,
    priceMin: parseAmount(priceText.min),
    priceMax: parseAmount(priceText.max),
    areaMin: parseAmount(areaText.min),
    areaMax: parseAmount(areaText.max),
    page: 1,
  };
  const count = useResultCount(next);
  const usd = draft.currency === 'USD';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const section = (title: string, body: ReactNode) => (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-fg-2">{title}</h3>
      {body}
    </section>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end"
      role="dialog"
      aria-modal="true"
      aria-label={t('search.filters')}
    >
      <button
        type="button"
        aria-label={t('map.close')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(next);
        }}
        className="relative flex max-h-[88svh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{t('search.filters')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('map.close')}
            className="flex size-9 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {section(
            t('search.districts'),
            <ChipGroup
              key={draft.districts.join()}
              options={DISTRICTS.map((district) => ({
                value: district.slug,
                label: locale === 'mn' ? district.nameMn : district.nameEn,
              }))}
              selected={draft.districts}
              onChange={(districts) => setDraft((d) => ({ ...d, districts }))}
              wide
            />,
          )}
          {section(
            t('search.rooms'),
            <ChipGroup
              key={draft.rooms.join()}
              options={ROOM_CHIPS.map((rooms) => ({
                value: rooms,
                label: rooms === SEARCH_LIMITS.roomsPlus ? `${rooms}+` : String(rooms),
              }))}
              selected={draft.rooms}
              onChange={(rooms) => setDraft((d) => ({ ...d, rooms }))}
            />,
          )}
          {section(
            usd ? t('search.priceUsd') : t('search.priceMnt'),
            <>
              {draft.type !== 'sale' && (
                <div className="inline-flex rounded-full bg-surface-3 p-1 text-sm">
                  {(['MNT', 'USD'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={draft.currency === value}
                      onClick={() => setDraft((d) => ({ ...d, currency: value }))}
                      className={`rounded-full px-3 py-1 ${draft.currency === value ? 'bg-surface font-medium shadow-sm' : 'text-fg-muted'}`}
                    >
                      {value === 'MNT' ? '₮ MNT' : '$ USD'}
                    </button>
                  ))}
                </div>
              )}
              <MinMax
                t={t}
                label={usd ? t('search.priceUsd') : t('search.priceMnt')}
                value={priceText}
                onChange={setPriceText}
              />
            </>,
          )}
          {section(
            t('search.area'),
            <MinMax t={t} label={t('search.area')} value={areaText} onChange={setAreaText} />,
          )}
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              <CubeIcon className="size-5 text-accent" />
              {t('search.has3d')}
            </span>
            <input
              type="checkbox"
              checked={draft.has3d}
              onChange={(event) => setDraft((d) => ({ ...d, has3d: event.target.checked }))}
              className="size-5 accent-primary"
            />
          </label>
          {draft.bounds && (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, bounds: null }))}
              className={`${pillClass} ${pillActiveClass}`}
            >
              {t('search.mapArea')}
              <CloseIcon className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              setDraft({ ...draft, ...cleared });
              setPriceText({ min: '', max: '' });
              setAreaText({ min: '', max: '' });
            }}
            className="px-2 text-sm font-medium text-fg-muted underline-offset-4 hover:underline"
          >
            {t('search.clearAll')}
          </button>
          <div className="flex-1">
            <ShowButton t={t} count={count} />
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function MinMax({
  t,
  label,
  value,
  onChange,
}: {
  t: Translator;
  label: string;
  value: { min: string; max: string };
  onChange: (value: { min: string; max: string }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        inputMode="decimal"
        aria-label={`${label}: ${t('search.min')}`}
        placeholder={t('search.min')}
        value={value.min}
        onChange={(event) => onChange({ ...value, min: event.target.value })}
        className={inputClass}
      />
      <span className="text-fg-subtle">–</span>
      <input
        inputMode="decimal"
        aria-label={`${label}: ${t('search.max')}`}
        placeholder={t('search.max')}
        value={value.max}
        onChange={(event) => onChange({ ...value, max: event.target.value })}
        className={inputClass}
      />
    </div>
  );
}
