"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FiltersSheet } from "@/components/filters-sheet";
import { Input } from "@/components/ui/input";
import { CONDITIONS, GENDERS } from "@/lib/inventory";
import type { NonNullColumns, Views } from "@/lib/supabase/types";
import { GearCard } from "./gear-card";
import { GearFilterRail, type GearFacet } from "./gear-filter-rail";
import { GearDetailSheet } from "./gear-detail-sheet";
import { GEAR_ITEM_PARAM } from "./gear-item-path";
import { GearCartTray } from "./gear-cart-tray";
import { GearCartSheet } from "./gear-cart-sheet";
import {
  GearPassphraseDialog,
  type GearPassphraseContact,
} from "./gear-passphrase-dialog";
import type {
  DeliveryMethod,
  PublicGearRequestOptions,
} from "@/lib/gear-requests";
import { trackGear } from "@/lib/analytics/form-events";
import { DEFAULT_LEXICON, type Lexicon } from "@/lib/lexicon";
import type { AccountOffer } from "@/lib/constituent/account-offer";
import type { ViewerContactPrefill } from "@/lib/constituent/viewer";

const PAGE_SIZE = 12;

/**
 * One row of `public_gear_catalog`, derived from the generated view row (#813
 * Phase 1).
 *
 * `id`, `description`, `condition` and `created_at` are `not null` on
 * `inventory_items` and a view drops that, so they are narrowed here. The six
 * `category_*` columns stay nullable because the view reaches them through two
 * left joins: an item filed under no category, or a category in no group, is
 * an ordinary row. `type` is the legacy free text / the "Other" category's
 * detail -- see categoryLabelFor.
 */
export type GearItem = NonNullColumns<
  Views<"public_gear_catalog">,
  "id" | "description" | "condition" | "created_at"
>;

/** The request the cart has just submitted, as the receipt needs it (#1359). */
export type SubmittedRequest = {
  deliveryMethod: DeliveryMethod;
  requestId: string;
};

export function GearCatalog({
  items,
  placeholderUrl,
  requestOptions,
  prefill,
  accountOffer = null,
  lexicon = DEFAULT_LEXICON,
  termsInForce = false,
  organizationName = null,
  passphraseContact = null,
  passphraseUnlocked = false,
}: {
  items: GearItem[];
  placeholderUrl: string | null;
  /** What the checkout form may offer (#1032): shipping, and how to pay for it. */
  requestOptions: PublicGearRequestOptions;
  /**
   * What a signed-in reader's session already knows about them (#1357),
   * handed to the checkout form so they do not retype it.
   */
  prefill?: ViewerContactPrefill;
  /**
   * Whether the receipt offers this reader an account, and which one (#1359).
   * Decided on the server, since only the server sees the module and the
   * session; null is "nothing to offer", which covers a linked reader and a
   * tenant without the constituent area.
   */
  accountOffer?: AccountOffer | null;
  /**
   * This organization's words (#896), passed down to the checkout form's
   * privacy notice (#684), which names what was requested.
   */
  lexicon?: Lexicon;
  /**
   * Whether this tenant serves `/terms` (#859), for the as-is notice on the
   * checkout form (#1367). It links the document only where one is served.
   */
  termsInForce?: boolean;
  /** Named in the passphrase dialog (#1536). */
  organizationName?: string | null;
  /** Where the passphrase dialog sends somebody without it (#1536). */
  passphraseContact?: GearPassphraseContact;
  /**
   * Whether this browser already holds a verified passphrase (#1536), read on
   * the server from its httpOnly cookie. Only whether, never the word.
   */
  passphraseUnlocked?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [conditionFilter, setConditionFilter] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // The open item lives in the URL, not in state, so it can be shared: a link
  // to `?item=<id>` loads the catalog with that item's sheet already open.
  // Opening one is a shallow `pushState`, which the router reflects into
  // useSearchParams without a server round trip -- and without unmounting the
  // catalog, so the cart, the filters and the page survive it.
  const searchParams = useSearchParams();
  const itemParam = searchParams.get(GEAR_ITEM_PARAM);
  const detailOpen = itemParam !== null;
  const selectedItem = itemParam
    ? (items.find((item) => item.id === itemParam) ?? null)
    : null;
  // What the sheet last showed, so it keeps its contents while it animates
  // closed rather than going blank the moment the parameter is dropped.
  const [shownItem, setShownItem] = useState<GearItem | null>(selectedItem);
  if (detailOpen && selectedItem !== shownItem) setShownItem(selectedItem);
  // Whether the open sheet's history entry is one this catalog pushed. If it
  // is, closing steps back over it, so Back after a close does not reopen the
  // item. If the reader arrived on a shared link, there is nothing of ours
  // behind it and Back would leave the site, so closing replaces instead.
  const pushedDetail = useRef(false);

  const openItem = (itemId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set(GEAR_ITEM_PARAM, itemId);
    window.history.pushState(null, "", `?${params}`);
    pushedDetail.current = true;
  };

  const closeItem = () => {
    if (pushedDetail.current) {
      pushedDetail.current = false;
      window.history.back();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.delete(GEAR_ITEM_PARAM);
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `?${query}` : window.location.pathname,
    );
  };
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());
  const [cartOpen, setCartOpen] = useState(false);
  // The request just submitted: its delivery method, so the receipt can say
  // what happens next, and its id, which is what the offer to keep it is
  // authorized by (#1359). Null until then and again when the cart reopens.
  const [cartSuccess, setCartSuccess] = useState<SubmittedRequest | null>(null);

  const openCart = () => {
    setCartSuccess(null);
    setCartOpen(true);
    trackGear("gear_cart_opened");
  };

  // From the detail sheet, which the cart tray cannot be seen or reached
  // through: hand the catalog straight over to the cart.
  const viewCartFromDetail = () => {
    closeItem();
    openCart();
  };

  // The tenant's passphrase gate (#1536). The item somebody tried to add waits
  // here while the dialog asks, and lands in the cart once it is answered.
  const [passphraseOpen, setPassphraseOpen] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [passphraseNotice, setPassphraseNotice] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(passphraseUnlocked);

  // The funnel's first step (#1711): the item's category key at most, never
  // its id or description.
  const trackAddedToCart = (itemId: string) => {
    const category = items.find((item) => item.id === itemId)?.category_key;
    trackGear("gear_added_to_cart", category ? { category } : {});
  };

  const toggleCartItem = (itemId: string) => {
    if (
      requestOptions.passphraseRequired &&
      !cartIds.has(itemId) &&
      !unlocked
    ) {
      setPendingItemId(itemId);
      setPassphraseNotice(null);
      setPassphraseOpen(true);
      trackGear("gear_passphrase_prompted");
      return;
    }
    if (!cartIds.has(itemId)) trackAddedToCart(itemId);
    setCartIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handlePassphraseUnlocked = () => {
    setUnlocked(true);
    setPassphraseOpen(false);
    setPassphraseNotice(null);
    if (pendingItemId) {
      const itemId = pendingItemId;
      trackAddedToCart(itemId);
      setCartIds((current) => new Set(current).add(itemId));
      setPendingItemId(null);
    }
  };

  // A submit the database refused because the passphrase changed since this
  // browser unlocked: the action dropped its cookie, so ask again, over the cart.
  const handlePassphraseRejected = (message: string) => {
    setUnlocked(false);
    setPendingItemId(null);
    setPassphraseNotice(message);
    setPassphraseOpen(true);
    trackGear("gear_passphrase_rejected");
    trackGear("gear_passphrase_prompted");
  };

  const cartItems = items.filter((item) => cartIds.has(item.id));

  // Built from the categories actually present in the catalog, grouped and in
  // the admin's own sort order -- not from de-duped free text, and not from the
  // whole vocabulary, so a category with nothing available isn't offered
  // (issue #667).
  const typeGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        label: string;
        sort: number;
        options: Map<string, { label: string; sort: number }>;
      }
    >();
    for (const item of items) {
      if (!item.category_key || !item.category_group_key) continue;
      const groupKey = item.category_group_key;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          label: item.category_group_label ?? groupKey,
          sort: item.category_group_sort_order ?? 0,
          options: new Map(),
        };
        groups.set(groupKey, group);
      }
      if (!group.options.has(item.category_key)) {
        group.options.set(item.category_key, {
          label: item.category_label ?? item.category_key,
          sort: item.category_sort_order ?? 0,
        });
      }
    }
    return [...groups.entries()]
      .sort((a, b) => a[1].sort - b[1].sort)
      .map(([key, group]) => ({
        key,
        label: group.label,
        options: [...group.options.entries()]
          .sort((a, b) => a[1].sort - b[1].sort)
          .map(([optionKey, option]) => ({
            key: optionKey,
            label: option.label,
          })),
      }));
  }, [items]);

  // Which items pass the search and every facet but `except`. With no
  // exception it is the catalog the grid shows; with one it is the set that
  // facet's counts are taken over, so each number says what clicking that
  // option would show.
  const matching = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (except: "type" | "condition" | "gender" | null) =>
      items.filter((item) => {
        if (except !== "type" && typeFilter && item.category_key !== typeFilter)
          return false;
        if (
          except !== "condition" &&
          conditionFilter &&
          item.condition !== conditionFilter
        )
          return false;
        if (except !== "gender" && genderFilter && item.gender !== genderFilter)
          return false;
        if (query && !item.description.toLowerCase().includes(query))
          return false;
        return true;
      });
  }, [items, search, typeFilter, conditionFilter, genderFilter]);

  const visibleItems = useMemo(() => matching(null), [matching]);

  const facets = useMemo((): GearFacet[] => {
    const tally = (
      pool: GearItem[],
      keyOf: (item: GearItem) => string | null,
    ) => {
      const counts = new Map<string, number>();
      for (const item of pool) {
        const key = keyOf(item);
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    };
    const typePool = matching("type");
    const conditionPool = matching("condition");
    const genderPool = matching("gender");
    const typeCounts = tally(typePool, (item) => item.category_key);
    const conditionCounts = tally(conditionPool, (item) => item.condition);
    const genderCounts = tally(genderPool, (item) => item.gender);

    return [
      {
        id: "type",
        label: "Type",
        allLabel: "All types",
        total: typePool.length,
        value: typeFilter,
        onChange: handleTypeFilterChange,
        groups: typeGroups.map((group) => ({
          key: group.key,
          label: group.label,
          options: group.options.map((option) => ({
            ...option,
            count: typeCounts.get(option.key) ?? 0,
          })),
        })),
      },
      {
        id: "condition",
        label: "Condition",
        allLabel: "All conditions",
        total: conditionPool.length,
        value: conditionFilter,
        onChange: handleConditionFilterChange,
        groups: [
          {
            key: "all",
            label: null,
            options: CONDITIONS.map((option) => ({
              key: option.value,
              label: option.label,
              count: conditionCounts.get(option.value) ?? 0,
            })),
          },
        ],
      },
      {
        id: "gender",
        label: "Gender",
        allLabel: "All genders",
        total: genderPool.length,
        value: genderFilter,
        onChange: handleGenderFilterChange,
        groups: [
          {
            key: "all",
            label: null,
            options: GENDERS.map((option) => ({
              key: option.value,
              label: option.label,
              count: genderCounts.get(option.value) ?? 0,
            })),
          },
        ],
      },
    ];
  }, [matching, typeGroups, typeFilter, conditionFilter, genderFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = visibleItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const activeFilterCount = [typeFilter, conditionFilter, genderFilter].filter(
    Boolean,
  ).length;

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleTypeFilterChange(value: string | null) {
    setTypeFilter(value);
    setPage(1);
  }

  function handleConditionFilterChange(value: string | null) {
    setConditionFilter(value);
    setPage(1);
  }

  function handleGenderFilterChange(value: string | null) {
    setGenderFilter(value);
    setPage(1);
  }

  function clearFilters() {
    setTypeFilter(null);
    setConditionFilter(null);
    setGenderFilter(null);
    setPage(1);
  }

  if (items.length === 0) {
    return (
      <p className="app-muted py-16 text-center text-sm">
        No gear is currently available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-8">
            <GearFilterRail
              facets={facets}
              activeCount={activeFilterCount}
              onClear={clearFilters}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="rainbow-surface flex flex-wrap items-end gap-4 rounded-xl border border-[var(--line)] p-4 shadow-md">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label
                htmlFor="gear-search"
                className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
              >
                Search
              </label>
              <Input
                id="gear-search"
                placeholder="Search description..."
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                className="h-8 w-full bg-card sm:w-64"
              />
            </div>

            <p className="app-muted text-sm tabular-nums" aria-live="polite">
              {visibleItems.length === items.length
                ? `${items.length} available`
                : `${visibleItems.length} of ${items.length}`}
            </p>

            <div className="lg:hidden">
              <FiltersSheet activeCount={activeFilterCount}>
                <GearFilterRail
                  facets={facets}
                  activeCount={activeFilterCount}
                  onClear={clearFilters}
                />
              </FiltersSheet>
            </div>
          </div>

          {visibleItems.length === 0 ? (
            <p className="app-muted py-16 text-center text-sm">
              No gear matches your filters.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {pagedItems.map((item) => (
                  <GearCard
                    key={item.id}
                    item={item}
                    onSelect={() => openItem(item.id)}
                    inCart={cartIds.has(item.id)}
                    onToggleCart={() => toggleCartItem(item.id)}
                    placeholderUrl={placeholderUrl}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="app-muted text-sm">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <GearDetailSheet
        item={detailOpen ? selectedItem : shownItem}
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) closeItem();
        }}
        inCart={shownItem ? cartIds.has(shownItem.id) : false}
        onToggleCart={() => shownItem && toggleCartItem(shownItem.id)}
        cartCount={cartItems.length}
        onViewCart={viewCartFromDetail}
        placeholderUrl={placeholderUrl}
      />

      <GearCartTray count={cartItems.length} onOpen={openCart} />
      <GearCartSheet
        items={cartItems}
        open={cartOpen}
        onOpenChange={setCartOpen}
        onRemove={toggleCartItem}
        success={cartSuccess}
        onSubmitted={(deliveryMethod, requestId) => {
          setCartSuccess({ deliveryMethod, requestId });
          setCartIds(new Set());
        }}
        placeholderUrl={placeholderUrl}
        requestOptions={requestOptions}
        prefill={prefill}
        accountOffer={accountOffer}
        lexicon={lexicon}
        termsInForce={termsInForce}
        onPassphraseRejected={handlePassphraseRejected}
      />

      {requestOptions.passphraseRequired ? (
        <GearPassphraseDialog
          open={passphraseOpen}
          onOpenChange={(open) => {
            setPassphraseOpen(open);
            if (!open) setPendingItemId(null);
          }}
          onUnlocked={handlePassphraseUnlocked}
          organizationName={organizationName}
          lexicon={lexicon}
          helpText={requestOptions.passphraseHelpText}
          contact={passphraseContact}
          notice={passphraseNotice}
        />
      ) : null}
    </div>
  );
}
