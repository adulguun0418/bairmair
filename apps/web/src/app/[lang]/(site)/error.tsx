'use client';

import { ErrorView } from '@/components/ErrorView';

/** A page of the website failed to render; header and footer stay. */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={error} reset={reset} boundary="site" />;
}
