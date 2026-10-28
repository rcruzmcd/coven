# Addenda — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §16 and §17, the two review addenda. Technology, system boundaries, security, the
route tree and the key workflows stay in the hub. A plain `§N` below is in this
file; a `§N` that lives in another file is always a link.

## 16. Addendum: Gaps From Role Review (2026-08-22)

A review against the Director of Operations and Bookkeeping/Finance Administration responsibilities in `planning/governance/roles-and-responsibilities.md` found four operational needs with no corresponding requirement anywhere above. As of this review, volunteers, registration, reimbursements, approvals, and impact tracking have all since shipped (see [§5.14](programs.md#514-program-management)–[§5.18](finance.md#518-reimbursements)); these four remain the only genuinely unspecified gaps.

## 16.1 Incident / problem documentation

The roles doc calls for "how incidents/problems are documented" as an internal process Operations must establish. This is now **partially implemented**: `event_incidents` (description, severity: minor/moderate/serious, people involved, occurred-at, reporting user, restricted to `admin`/`event_coordinator`) covers event-scoped incidents — see [§5.5](events.md#55-event-management).

**Remaining gap.** `event_incidents` has no category field, no `open`/`resolved` status or resolution notes, no optional inventory-item linkage, and no incident that isn't tied to a specific event (e.g. a storage-location issue). If those are needed, either extend `event_incidents` or add the originally-proposed cross-cutting `incident_reports` (`category`, `inventory_item_id` nullable FK, `status`, `resolution_notes`, and `event_id` made nullable) alongside it.

## 16.2 Inventory storage locations

The roles doc lists "storage locations" under Director of Operations inventory duties. [§5.4](inventory.md#54-inventory-and-donation-management) and [§6](../technical-spec.md#6-proposed-data-model) give `inventory_items` no location field — the current model has no way to record where a physical item actually is.

The system shall let authorized users define named storage locations (e.g. a storage unit, an event trailer, a volunteer's garage) and assign each inventory item to one.

**Data model:** `storage_locations` — `id`, `name`, `description`, `notes`. `inventory_items.location_id` — nullable FK to `storage_locations`. A location change should be recorded as a movement (extending the `inventory_movements` movement-type set in [§5.4](inventory.md#54-inventory-and-donation-management)) so relocation history isn't lost, consistent with the append-only pattern already used for stock changes.

**Not yet implemented.**

## 16.3 Low-stock identification

The roles doc lists "identifying low-stock items" under Director of Operations inventory duties. Neither the inventory valuation reporting in [§5.19](inventory.md#519-inventory-valuation-reporting) nor any other section surfaces stock levels against a threshold — only total value.

The system shall flag inventory item types whose current available quantity has fallen below a defined threshold, surfaced on the dashboard ([§5.10](../technical-spec.md#510-dashboard-and-reporting)) and/or the inventory reports page ([§5.19](inventory.md#519-inventory-valuation-reporting)).

**Data model:** a `low_stock_threshold` column (nullable, per item type/category) plus a computed view comparing current available quantity (derived from `inventory_movements` per [§5.4](inventory.md#54-inventory-and-donation-management)) against that threshold. No new transactional tables required.

**Not yet implemented.**

## 16.4 Donated vs. purchased inventory tracking

The roles doc lists "tracking donated vs. purchased items" under Director of Operations inventory duties. [§6](../technical-spec.md#6-proposed-data-model) describes `inventory_items` as "donation-managed inventory records" fed from `donation_items` — there's no path for inventory the organization buys directly rather than receives as a donation, so the two can't currently be distinguished in reporting.

The system shall record each inventory item's acquisition type (donated vs. purchased vs. other) independent of whether a `donation`/`donation_items` record exists, and let valuation/impact reporting ([§5.15](programs.md#515-impact-tracking-and-reporting), [§5.19](inventory.md#519-inventory-valuation-reporting)) break totals out by acquisition type.

**Data model:** `inventory_items.acquisition_type` (donated/purchased/other). A purchased item is created via a direct inventory receipt movement ([§5.4](inventory.md#54-inventory-and-donation-management)) with no donor linkage, rather than through the donation workflow; if a purchase has an associated expense record ([§5.6](finance.md#56-expense-management)), link `inventory_items` to the originating `event_expenses` row so the item's cost basis is traceable.

**Not yet implemented.**

## 17. Addendum: Access Management Requirements Review (2026-08-28)

A detailed requirements draft for a new Administration > Access Management module (an external asset/access registry — tracks who has access to what and whether it's been reviewed; explicitly not a credential/secrets store) was reviewed against the existing codebase before ticketing. Two issues came out of that review: [#421](https://github.com/rcruzmcd/coven/issues/421) (prerequisite — the `audit_log.table_name` check-constraint allowlist has already caused two production bugs and needs a registry-table replacement before more audited tables are added) and [#424](https://github.com/rcruzmcd/coven/issues/424) (MVP — `services`/`assets`/`access_grants` tables, Administration sub-tab). The sections below record what the original draft proposed that was deliberately left out of both tickets, and why, so it isn't mistaken for an oversight later.

## 17.1 Parallel portal-role tier system

The draft proposed new portal permission tiers (Super Admin / Board Admin / Director / Standard User) specific to this module. **Not adopted.** The portal already has a data-driven `resources`/`role_permissions` matrix ([§6](../technical-spec.md#6-proposed-data-model), `has_permission()`) that every other module uses for authorization; #424 adds resource keys to that matrix instead of introducing a second RBAC system.

## 17.2 Access requests (self-service request/approval workflow)

The draft's request workflow (requester → asset owner notified → approve/deny → portal record updated) was excluded from #424. At the organization's current size, asking an asset's administrator directly (email/Slack) serves the same purpose without a new `access_requests` table, approval routing, or notification UI. **Not yet implemented** — revisit if request volume ever makes the informal path a bottleneck.

## 17.3 Persisted access-review and offboarding-case records

The draft modeled access reviews and offboarding as their own tables (review items, offboarding cases/tasks). #424 instead records a review as an `audit_log` entry plus an updated `last_verified`/`last_reviewed` date on the grant/asset, and derives an offboarding checklist live from `access_grants where person_id = X and status = 'active'` rather than persisting a case object. **Not yet implemented** — worth a real case-tracking table if offboarding checklists ever need to persist partial progress across sessions or be assigned/tracked independently of the live grant list.

## 17.4 Nested asset category taxonomy

The draft's roughly six-category, thirty-subcategory taxonomy (Technology/Communications/Operations/Finance/Administration/Marketing, each with subtypes) was replaced with a single flat `category` enum on `assets` in #424. **Not adopted** — the organization's actual asset count (the draft's own estimate: under 25) doesn't justify a nested taxonomy; revisit only if the flat enum becomes unwieldy in practice.

## 17.5 MFA verification against each service

MFA status is a manually-updated field in #424 (required/enabled/disabled/unknown), not verified against each service's actual state. Per-service API integration (Cloudflare, GitHub, Vercel, etc.) to verify MFA automatically, and eventual automated provisioning/deprovisioning, were explicitly deferred in the original draft. **Not yet implemented.**

## 17.6 Onboarding packages, access-matrix report, service integrations

The draft's onboarding-recommendation UI, a person × asset access-matrix report, and any service API integrations (Cloudflare/GitHub/Vercel/Google Workspace/password-manager) were excluded from #424 entirely — no ticket exists for these yet. **Not yet implemented** — revisit once the MVP registry has real data in it.
