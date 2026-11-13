import Image from 'next/image';

/**
 * The horizontal logo (mark + wordmark), with a light-ink version in dark mode. Both are built
 * from assets/brand/logo.svg by assets/brand/build-horizontal.mjs (aspect 3.608).
 */
export function Logo({
  alt,
  className,
  preload,
}: {
  alt: string;
  className: string;
  preload?: boolean;
}) {
  const size = { width: 116, height: 32, unoptimized: true, preload } as const;
  return (
    <>
      <Image
        src="/brand/logo-horizontal.svg"
        alt={alt}
        {...size}
        className={`${className} dark:hidden`}
      />
      <Image
        src="/brand/logo-horizontal-dark.svg"
        alt={alt}
        {...size}
        className={`${className} hidden dark:block`}
      />
    </>
  );
}
