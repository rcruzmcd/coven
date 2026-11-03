"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { updateNavSettingsAction } from "./settings-actions";
import type { SettingActionResult } from "@/lib/settings/write-app-setting";
import type { NavSettings } from "@/lib/public-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { runAction } from "@/components/portal/action-toast";

/** One top-level menu entry, with its default label already in the tenant's words. */
export type NavPanelGroup = {
  href: string;
  defaultLabel: string;
  /** Hidden by Page visibility, so it is in the order but not on the site. */
  hidden: boolean;
};

/**
 * The public site's top-level menu (#1726): its order and its labels, nothing
 * else. Up/down buttons rather than drag, so the whole control works from a
 * keyboard. One save for the whole menu, since an order is one decision rather
 * than one per row.
 */
export function NavPanel({
  groups,
  nav,
  defaultOrder,
  maxLabelLength,
}: {
  /** In the tenant's current order. */
  groups: NavPanelGroup[];
  /** The same hrefs in the platform's order, for Restore default. */
  defaultOrder: string[];
  nav: NavSettings;
  maxLabelLength: number;
}) {
  const router = useRouter();
  const byHref = new Map(groups.map((group) => [group.href, group]));
  const savedOrder = groups.map((group) => group.href);

  const [order, setOrder] = useState(savedOrder);
  const [labels, setLabels] = useState<Record<string, string>>(nav.labels);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // A label typed back to the default is not an override: stored, it would
  // pin the tenant to today's wording when the platform's later changes.
  const overrides = Object.fromEntries(
    Object.entries(labels)
      .map(([href, label]) => [href, label.trim()] as const)
      .filter(
        ([href, label]) => label && label !== byHref.get(href)?.defaultLabel,
      ),
  );
  const dirty =
    order.join("\n") !== savedOrder.join("\n") ||
    JSON.stringify(overrides) !== JSON.stringify(nav.labels);
  const isDefault =
    Object.keys(overrides).length === 0 &&
    order.join("\n") === defaultOrder.join("\n");

  function move(index: number, by: -1 | 1) {
    setOrder((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateNavSettingsAction({ order, labels: overrides }),
        {
          success: "The menu is saved.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  function reset() {
    setOrder(defaultOrder);
    setLabels({});
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          <ol className="divide-y divide-[var(--line)]">
            {order.map((href, index) => {
              const group = byHref.get(href);
              if (!group) return null;
              const inputId = `nav-label-${index}`;
              return (
                <li key={href} className="flex items-center gap-3 py-3">
                  <span className="app-muted w-5 shrink-0 text-right text-sm tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={inputId} className="sr-only">
                      Menu label for {group.defaultLabel}
                    </label>
                    <Input
                      id={inputId}
                      value={labels[href] ?? ""}
                      placeholder={group.defaultLabel}
                      maxLength={maxLabelLength}
                      onChange={(event) =>
                        setLabels((current) => ({
                          ...current,
                          [href]: event.target.value,
                        }))
                      }
                    />
                    <p className="app-muted mt-1 text-xs">
                      {href}
                      {group.hidden
                        ? " · Hidden in Page visibility, so not in the menu"
                        : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <TooltipIconButton
                      label={`Move ${group.defaultLabel} up`}
                      disabled={index === 0 || isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </TooltipIconButton>
                    <TooltipIconButton
                      label={`Move ${group.defaultLabel} down`}
                      disabled={index === order.length - 1 || isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </TooltipIconButton>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={save} disabled={!dirty || isPending}>
          {isPending ? <Spinner className="size-4" /> : null}
          Save menu
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={reset}
          disabled={isDefault || isPending}
        >
          Restore default
        </Button>
      </div>
    </div>
  );
}
