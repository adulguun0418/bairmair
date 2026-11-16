'use client';

import { ErrorView } from '@/components/ErrorView';

/** The app's 3D embed failed to render. No link home: it is shown inside the app's WebView. */
export default function EmbedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={error} reset={reset} boundary="embed" />;
}
