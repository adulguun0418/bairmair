'use client';

import dynamic from 'next/dynamic';

// MapLibre needs the browser (WebGL) and is large: load maps in the browser only, after the page.

function Placeholder() {
  return <div className="h-full w-full animate-pulse bg-surface-3" />;
}

export const SearchMap = dynamic(() => import('./SearchMap'), {
  ssr: false,
  loading: Placeholder,
});

export const LocationMap = dynamic(() => import('./LocationMap'), {
  ssr: false,
  loading: Placeholder,
});

export const PinPicker = dynamic(() => import('./PinPicker'), {
  ssr: false,
  loading: Placeholder,
});
