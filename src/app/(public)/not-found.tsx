import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { NotFoundEvent } from "@/components/analytics/not-found-event";

export default function PublicNotFound() {
  return (
    <PageShell>
      <NotFoundEvent />
      <div className="w-fit">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
          Page not found
        </h1>
      </div>
      <p className="app-muted mt-4 max-w-lg text-sm leading-relaxed sm:text-base">
        We couldn&apos;t find what you were looking for — it may have moved, or
        the link might be out of date.
      </p>
      <Button
        nativeButton={false}
        render={<Link href="/home" />}
        className="mt-6"
      >
        Back to home
      </Button>
    </PageShell>
  );
}
