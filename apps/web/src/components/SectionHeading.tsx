import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRightIcon } from '@/components/icons';

/** A section title with a "see all" link on the right (home rows, similar listings). */
export function SectionHeading({
  title,
  href,
  more,
  icon,
}: {
  title: string;
  href: string;
  more: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight sm:text-2xl">
        {icon && (
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-subtle text-accent [&>svg]:size-5">
            {icon}
          </span>
        )}
        {title}
      </h2>
      <Link
        href={href}
        className="group inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-line transition hover:bg-surface hover:ring-line-2"
      >
        {more}
        <ArrowRightIcon className="size-3.5 transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

/** Card-shaped placeholders while a row of listings loads. */
export function ListingRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section className="space-y-6" aria-hidden>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-3" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="h-80 animate-pulse rounded-3xl bg-surface-3" />
        ))}
      </div>
    </section>
  );
}
