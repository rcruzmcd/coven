"use client";

import { useEffect, useState, useTransition } from "react";
import {
  deleteGiveawayPackageAction,
  deleteGiveawayTicketSaleAction,
  listGiveawayTicketSalesAction,
  recordGiveawayTicketSaleAction,
  upsertGiveawayPackageAction,
  type GiveawayTicketSale,
  type GiveawayTicketTotal,
  type GiveawayTierConfig,
} from "../giveaway-tier-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { formatCurrency, formatInstantDate } from "@/lib/format";

function ticketSummary(totals: GiveawayTicketTotal[]) {
  return totals
    .filter((total) => total.quantity > 0)
    .map((total) => `${total.quantity} ${total.tier_label}`)
    .join(" · ");
}

/**
 * The sold-ticket path (issue #5): a handful of price points, each matching a
 * tier, plus the record of what was sold. Payment is taken outside the system
 * (cash, card reader) -- this records that it happened and says how many
 * tickets to hand over.
 */
export function PackagesSection({
  giveawayId,
  config,
  canEdit,
  onChanged,
}: {
  giveawayId: string;
  config: GiveawayTierConfig;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [tierId, setTierId] = useState("");
  const [bundleQuantity, setBundleQuantity] = useState("1");

  const [sellPackageId, setSellPackageId] = useState("");
  const [sellQuantity, setSellQuantity] = useState("1");
  const [lastSaleTickets, setLastSaleTickets] = useState<string | null>(null);

  const [sales, setSales] = useState<GiveawayTicketSale[] | null>(null);
  const { tiers, packages } = config;
  const activePackages = packages.filter((pkg) => pkg.is_active);

  useEffect(() => {
    let cancelled = false;
    listGiveawayTicketSalesAction(giveawayId).then((result) => {
      if (cancelled) return;
      setSales("error" in result ? [] : result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [giveawayId, config]);

  function refresh() {
    listGiveawayTicketSalesAction(giveawayId).then((result) => {
      setSales("error" in result ? [] : result.data);
    });
    onChanged();
  }

  function handleAddPackage() {
    startTransition(async () => {
      await runAction(
        () =>
          upsertGiveawayPackageAction(giveawayId, {
            name,
            price: Number(price),
            tierId,
            bundleQuantity: Number(bundleQuantity),
            rank: packages.length,
            isActive: true,
          }),
        {
          success: "Ticket package added.",
          error: "Could not add the package. Please try again.",
          onSuccess: () => {
            setName("");
            setPrice("");
            setTierId("");
            setBundleQuantity("1");
            setShowAdd(false);
            onChanged();
          },
        },
      );
    });
  }

  function handleTogglePackage(packageId: string, isActive: boolean) {
    const pkg = packages.find((candidate) => candidate.id === packageId);
    if (!pkg) return;
    startTransition(async () => {
      await runAction(
        () =>
          upsertGiveawayPackageAction(giveawayId, {
            id: pkg.id,
            name: pkg.name,
            price: Number(pkg.price),
            tierId: pkg.tier_id,
            bundleQuantity: pkg.bundle_quantity,
            rank: pkg.rank,
            isActive,
          }),
        {
          success: isActive
            ? "Package back on sale."
            : "Package taken off sale.",
          error: "Could not update the package. Please try again.",
          onSuccess: onChanged,
        },
      );
    });
  }

  function handleDeletePackage(packageId: string) {
    startTransition(async () => {
      await runAction(() => deleteGiveawayPackageAction(packageId), {
        success: "Package removed.",
        error: "Could not remove the package. Please try again.",
        onSuccess: onChanged,
      });
    });
  }

  function handleRecordSale() {
    startTransition(async () => {
      const outcome = await runAction(
        () =>
          recordGiveawayTicketSaleAction(giveawayId, {
            packageId: sellPackageId,
            quantity: Number(sellQuantity),
          }),
        {
          success: "Ticket sale recorded.",
          error: "Could not record the sale. Please try again.",
        },
      );
      if (!outcome.ok) return;
      setLastSaleTickets(ticketSummary(outcome.data.totals));
      setSellQuantity("1");
      refresh();
    });
  }

  function handleVoidSale(saleId: string) {
    startTransition(async () => {
      await runAction(() => deleteGiveawayTicketSaleAction(saleId), {
        success: "Sale voided.",
        description: "The tickets it issued were removed from the pool.",
        error: "Could not void the sale. Please try again.",
        onSuccess: refresh,
      });
    });
  }

  if (!tiers.length) return null;

  const revenue = (sales ?? []).reduce(
    (total, sale) => total + Number(sale.amount),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      {canEdit && !showAdd && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowAdd(true)}
          >
            Add package
          </Button>
        </div>
      )}

      {packages.length ? (
        <ul className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
          {packages.map((pkg) => {
            const tier = tiers.find(
              (candidate) => candidate.id === pkg.tier_id,
            );
            return (
              <li
                key={pkg.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {pkg.name}
                    {!pkg.is_active && (
                      <span className="app-muted"> · off sale</span>
                    )}
                  </p>
                  <p className="app-muted text-sm">
                    {formatCurrency(Number(pkg.price))} ·{" "}
                    {pkg.bundle_quantity === 1
                      ? `1 ${tier?.label ?? ""} bundle`
                      : `${pkg.bundle_quantity} ${tier?.label ?? ""} bundles`}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      focusableWhenDisabled
                      onClick={() =>
                        handleTogglePackage(pkg.id, !pkg.is_active)
                      }
                    >
                      {pkg.is_active ? "Take off sale" : "Put on sale"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      focusableWhenDisabled
                      onClick={() => handleDeletePackage(pkg.id)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="No ticket packages"
          description="Add the price points you sell at, each tied to a tier."
        />
      )}

      {canEdit && showAdd && (
        <div className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-4">
          <Field className="w-48">
            <FieldLabel htmlFor="package-name" required>
              Package name
            </FieldLabel>
            <Input
              id="package-name"
              required
              placeholder="e.g. Gold entry"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field className="w-28">
            <FieldLabel htmlFor="package-price">Price ($)</FieldLabel>
            <Input
              id="package-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </Field>
          <Field className="w-36">
            <FieldLabel htmlFor="package-tier">Tier</FieldLabel>
            <Select
              value={tierId || null}
              onValueChange={(value) => setTierId(value ?? "")}
            >
              <SelectTrigger id="package-tier" className="w-full">
                <SelectValue placeholder="Select a tier">
                  {(value: string) =>
                    tiers.find((tier) => tier.id === value)?.label ??
                    "Select a tier"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tiers.map((tier) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    {tier.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-28">
            <FieldLabel htmlFor="package-bundles">Bundles</FieldLabel>
            <Input
              id="package-bundles"
              type="number"
              min="1"
              step="1"
              value={bundleQuantity}
              onChange={(event) => setBundleQuantity(event.target.value)}
            />
          </Field>
          <Button
            type="button"
            onClick={handleAddPackage}
            disabled={isPending || !name.trim() || !tierId || !price}
          >
            Add
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowAdd(false)}
            disabled={isPending}
            focusableWhenDisabled
          >
            Cancel
          </Button>
        </div>
      )}

      {canEdit && activePackages.length > 0 && (
        <div className="border-t border-[var(--line)] pt-4">
          <h4 className="text-sm font-medium">Record a sale</h4>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field className="w-56">
              <FieldLabel htmlFor="sell-package">Package</FieldLabel>
              <Select
                value={sellPackageId || null}
                onValueChange={(value) => setSellPackageId(value ?? "")}
              >
                <SelectTrigger id="sell-package" className="w-full">
                  <SelectValue placeholder="Select a package">
                    {(value: string) =>
                      activePackages.find((pkg) => pkg.id === value)?.name ??
                      "Select a package"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {activePackages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name} — {formatCurrency(Number(pkg.price))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field className="w-28">
              <FieldLabel htmlFor="sell-quantity">Quantity</FieldLabel>
              <Input
                id="sell-quantity"
                type="number"
                min="1"
                step="1"
                value={sellQuantity}
                onChange={(event) => setSellQuantity(event.target.value)}
              />
            </Field>
            <Button
              type="button"
              onClick={handleRecordSale}
              disabled={isPending || !sellPackageId}
            >
              {isPending ? (
                <>
                  <Spinner /> Recording...
                </>
              ) : (
                "Record sale"
              )}
            </Button>
          </div>

          {lastSaleTickets && (
            <Alert className="mt-3">
              <AlertDescription>
                Hand over: <strong>{lastSaleTickets}</strong>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {sales === null ? null : sales.length > 0 ? (
        <div className="border-t border-[var(--line)] pt-4">
          <div className="flex items-baseline justify-between">
            <h4 className="text-sm font-medium">Sales</h4>
            <p className="app-muted text-sm">{formatCurrency(revenue)} total</p>
          </div>
          <ul className="mt-3 divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
            {sales.map((sale) => {
              const pkg = packages.find(
                (candidate) => candidate.id === sale.package_id,
              );
              return (
                <li
                  key={sale.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div>
                    <p className="text-sm">
                      {sale.quantity} × {pkg?.name ?? "Package"}
                      {sale.purchaser?.name ? ` · ${sale.purchaser.name}` : ""}
                    </p>
                    <p className="app-muted text-sm">
                      {formatInstantDate(sale.sold_at)} ·{" "}
                      {formatCurrency(Number(sale.amount))}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      focusableWhenDisabled
                      onClick={() => handleVoidSale(sale.id)}
                    >
                      Void
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
