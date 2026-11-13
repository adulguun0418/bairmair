'use client';

import { searchArgs, type SearchFilters } from '@bairmair/browse';
import { useRouter } from 'next/navigation';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { publicClient } from '@/lib/supabase-public';

interface SearchNavigation {
  /** Goes to another search (same page, new filters) without scrolling to the top. */
  navigate: (href: string) => void;
  /** True while the new results load. */
  pending: boolean;
}

const Context = createContext<SearchNavigation | null>(null);

/**
 * Wraps the search page so the filter bar, the results and the map share one navigation:
 * filters apply at once, and the results dim until the new ones arrive.
 */
export function SearchNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback(
    (href: string) => startTransition(() => router.push(href, { scroll: false })),
    [router],
  );
  const value = useMemo(() => ({ navigate, pending }), [navigate, pending]);
  return <Context value={value}>{children}</Context>;
}

export function useSearchNavigation(): SearchNavigation {
  const value = use(Context);
  if (!value) throw new Error('useSearchNavigation outside SearchNavigationProvider');
  return value;
}

/** The results, dimmed (and marked busy) while a new search loads. */
export function PendingResults({ children }: { children: ReactNode }) {
  const { pending } = useSearchNavigation();
  return (
    <div
      aria-busy={pending}
      className={`min-w-0 transition-opacity duration-200 ${pending ? 'opacity-50' : ''}`}
    >
      {children}
    </div>
  );
}

/**
 * How many listings a set of filters would find, for "Show 12 listings" buttons while the
 * visitor is still choosing. Asked after a short pause in typing; null while unknown.
 */
export function useResultCount(filters: SearchFilters, enabled = true): number | null {
  const key = JSON.stringify(searchArgs(filters));
  const [result, setResult] = useState<{ key: string; count: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void publicClient()
        .rpc('search_listings', { ...JSON.parse(key), p_limit: 1, p_offset: 0 })
        .select('total_count')
        .abortSignal(controller.signal)
        .then(({ data, error }) => {
          if (controller.signal.aborted || error) return;
          const rows = data as unknown as { total_count: number }[];
          setResult({ key, count: rows[0]?.total_count ?? 0 });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, enabled]);

  return result?.key === key ? result.count : null;
}

/**
 * The filter bar's sticky strip under the site header. Its height (it wraps on narrow screens)
 * goes into `--search-bar-h`, so the map beside the results can stick right below it.
 */
export function StickyBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--search-bar-h', `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--search-bar-h');
    };
  }, []);
  return (
    <div ref={ref} className="sticky top-16 z-30 border-b border-line bg-page/90 backdrop-blur-md">
      {children}
    </div>
  );
}

/** Cards report the listing under the pointer, so the map can highlight its pin. */
export const LISTING_HOVER_EVENT = 'bairmair:listing-hover';

/** Reports hovers over `[data-listing-id]` elements inside it (a list of cards). */
export function HoverReporter({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<string | null>(null);
  const report = (id: string | null) => {
    if (id === current) return;
    setCurrent(id);
    window.dispatchEvent(new CustomEvent<string | null>(LISTING_HOVER_EVENT, { detail: id }));
  };
  return (
    <div
      onPointerOver={(event) => {
        const card = (event.target as Element).closest<HTMLElement>('[data-listing-id]');
        report(card?.dataset.listingId ?? null);
      }}
      onPointerLeave={() => report(null)}
    >
      {children}
    </div>
  );
}
