'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * A listing photo filling its (positioned) parent: resized and served as WebP by the image
 * service where there is one, over a shimmer while it loads, fading in once it has.
 */
export function Photo({
  src,
  alt,
  sizes,
  priority = false,
  className = '',
}: {
  src: string;
  alt: string;
  /** How wide the photo shows, for picking the file size, e.g. `(min-width: 640px) 50vw, 100vw`. */
  sizes: string;
  /** The page's main photo: loads first, no lazy loading. */
  priority?: boolean;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <span aria-hidden className="absolute inset-0 bg-shimmer" />}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        onLoad={() => setLoaded(true)}
        className={`object-cover transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${className}`}
      />
    </>
  );
}
