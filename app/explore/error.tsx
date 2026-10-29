"use client";

import Link from "next/link";

export default function CatalogError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-lg px-6 py-24">
    <h1 className="text-2xl font-medium">Explore</h1>
    <p className="my-6 text-sm text-neutral-600">Could not load places. Please try again.</p>
    <button type="button" className="cursor-pointer rounded-lg bg-neutral-100 px-4 py-2 text-sm" onClick={reset}>Try again</button>
    <Link href="/projects/new" className="ml-5 text-sm">Projects</Link>
  </main>;
}
