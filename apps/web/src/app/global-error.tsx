'use client';

import { ErrorView } from '@/components/ErrorView';
import './globals.css';

/**
 * The document shell itself (`[lang]/layout.tsx`) failed: this replaces it, so it brings its
 * own `<html>` and `<body>`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="mn">
      <body className="bg-page text-fg">
        <ErrorView error={error} reset={reset} boundary="global" />
      </body>
    </html>
  );
}
