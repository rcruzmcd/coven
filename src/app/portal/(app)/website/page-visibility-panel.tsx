"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePageVisibilityAction } from "./settings-actions";
import type { SettingActionResult } from "@/lib/settings/write-app-setting";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
// Type-only: @/lib/page-visibility also exports server helpers that pull in
// createSupabaseServerClient, which must not reach the client bundle. The slot
// list arrives as a prop from the server page, same as BrandingPanel.
import type { PublicPageSlot } from "@/lib/page-visibility";
import { runAction } from "@/components/portal/action-toast";
import { Lock } from "lucide-react";

/** A required page with its reason already resolved to prose by the server. */
export type RequiredPageRow = { key: string; label: string; reason: string };

/**
 * A section this organization is not entitled to (#902). Read-only and off,
 * with the reason on screen rather than a switch that writes a flag the gate
 * will ignore -- the same treatment `notifications.from_address` gets when its
 * domain is not verified, and for the same reason.
 *
 * Shown rather than hidden: an administrator looking for Gear should find out
 * that it exists and is not theirs, not that it has silently vanished from a
 * list they remember it being on.
 */
function BlockedRow({ slot }: { slot: PublicPageSlot }) {
  const labelId = `page-visibility-${slot.key}-label`;
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium">
          {slot.label}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">
          {slot.description}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">
          Not part of this organization&rsquo;s plan, so it stays off the public
          site whatever this switch says. Ask whoever manages your account if
          you need it.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <span className="app-muted w-14 text-right text-xs">Unavailable</span>
        <Switch checked={false} disabled aria-labelledby={labelId} />
      </div>
    </div>
  );
}

/**
 * A page with no switch (#1726): on whatever is stored, and saying why rather
 * than leaving an administrator to wonder where it went in the list.
 */
function RequiredRow({ page }: { page: RequiredPageRow }) {
  const labelId = `page-visibility-required-${page.key}-label`;
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium">
          {page.label}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">{page.reason}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <Lock aria-hidden className="app-muted size-3.5" />
        <span className="app-muted w-14 text-right text-xs">Always on</span>
        <Switch checked disabled aria-labelledby={labelId} />
      </div>
    </div>
  );
}

function PageVisibilityRow({
  slot,
  visible,
  onError,
}: {
  slot: PublicPageSlot;
  visible: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  // Mirrors the switch immediately so the toggle doesn't feel stuck while the
  // Server Action round-trips. `useOptimistic` rather than plain state on
  // purpose: it drops back to the server's own value the moment the transition
  // ends, so the switch can never keep showing a change the server didn't
  // actually make. Plain state kept the optimistic value forever, which is how
  // a read that was failing server-side still looked like a successful save --
  // right up until a later navigation remounted the row and it "reverted".
  const [checked, setChecked] = useOptimistic(visible);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    onError(null);

    startTransition(async () => {
      setChecked(next);
      await runAction<SettingActionResult>(
        () => updatePageVisibilityAction(slot.key, next),
        {
          success: `${slot.label} is now ${next ? "visible" : "hidden"}.`,
          onError,
          onSuccess: () => {
            // Keeps the transition open until the server tree is refetched, so
            // the optimistic value hands off directly to the re-read one.
            router.refresh();
          },
        },
      );
    });
  }

  const labelId = `page-visibility-${slot.key}-label`;

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium">
          {slot.label}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">
          {slot.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {isPending ? <Spinner className="size-4" /> : null}
        <span className="app-muted w-14 text-right text-xs">
          {checked ? "Visible" : "Hidden"}
        </span>
        <Switch
          checked={checked}
          onCheckedChange={handleChange}
          disabled={isPending}
          aria-labelledby={labelId}
        />
      </div>
    </div>
  );
}

export function PageVisibilityPanel({
  slots,
  visibility,
  blockedSlots = {},
  requiredPages = [],
}: {
  slots: PublicPageSlot[];
  visibility: Record<string, boolean>;
  /** Slot key -> the module withholding it (#902). Empty for most tenants. */
  blockedSlots?: Record<string, string>;
  /** Pages with no switch (#1726), listed after the ones that have one. */
  requiredPages?: RequiredPageRow[];
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="divide-y divide-[var(--line)]">
          {slots.map((slot) =>
            blockedSlots[slot.key] ? (
              <BlockedRow key={slot.key} slot={slot} />
            ) : (
              <PageVisibilityRow
                key={slot.key}
                slot={slot}
                visible={visibility[slot.key] ?? slot.defaultVisible}
                onError={setError}
              />
            ),
          )}
        </CardContent>
      </Card>

      {requiredPages.length > 0 ? (
        <section
          aria-labelledby="page-visibility-required"
          className="space-y-2"
        >
          <h2 id="page-visibility-required" className="text-base font-semibold">
            Always on
          </h2>
          <p className="app-muted text-sm leading-relaxed">
            These pages have no switch. The site needs them to work, or another
            setting decides whether they are served.
          </p>
          <Card>
            <CardContent className="divide-y divide-[var(--line)]">
              {requiredPages.map((page) => (
                <RequiredRow key={page.key} page={page} />
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
