"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { createPersonAction } from "./actions";
import {
  PersonFormFields,
  emptyPersonForm,
  packPersonFormData,
  type PersonFormState,
} from "./person-form-fields";
import type { PersonListItem } from "./actions";
import {
  PersonAccountBadge,
  isOrganization,
  type PersonType,
  type RoleKey,
} from "./people-shared";
import { filterPeople } from "./person-search";
import { personDisplayName } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";

export type PickedPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** Optional for the same reason as on PersonListItem -- many callers build
   * a PickedPerson from a narrower embedded `people(...)` relation. */
  preferred_name?: string | null;
  auth_user_id?: string | null;
  /** Absent means "no role known", which reads as a website account (#1192). */
  has_portal_access?: boolean | null;
};

/**
 * How the search input gets its accessible name (#1854). One of the two is
 * required, so a new call site cannot fall back to being announced by its
 * placeholder ("Search by name or email...") instead of its label.
 *
 * - `id`: put it on the search input and point the field's visible label at
 *   it (`<FieldLabel htmlFor={id}>`). The usual case.
 * - `aria-label`: only where there is no visible label to point.
 */
export type PersonPickerName =
  { id: string; "aria-label"?: never } | { id?: never; "aria-label": string };

export function PersonPicker({
  people,
  selected,
  onSelect,
  onPersonCreated,
  newPersonRole,
  placeholder = "Search by name or email...",
  allowCreate = true,
  onlyOrganizations = false,
  id,
  "aria-label": ariaLabel,
  required = false,
  initialQuery = "",
}: PersonPickerName & {
  people: PersonListItem[];
  selected: PickedPerson | null;
  onSelect: (person: PickedPerson | null) => void;
  onPersonCreated: (person: PickedPerson) => void;
  /**
   * Role to pre-check in "+ Create new person". Intentionally has no default:
   * this used to fall back to is_sponsor, which pre-checked Sponsor on every
   * picker in the app (issue #569). Pass one only where the surrounding
   * context implies a role; leave it unset elsewhere so nothing is guessed.
   */
  newPersonRole?: RoleKey;
  placeholder?: string;
  allowCreate?: boolean;
  /** Restrict search/create to organization people rows. */
  onlyOrganizations?: boolean;
  /**
   * States on the search input that a person has to be picked (#1071). The
   * asterisk a FieldLabel renders is aria-hidden, so without this a required
   * picker says nothing to a screen reader.
   */
  required?: boolean;
  /** What the search starts with, for a caller that already has a name. */
  initialQuery?: string;
}) {
  const pickerPersonType: PersonType = onlyOrganizations
    ? "organization"
    : "individual";
  const [query, setQuery] = useState(initialQuery);
  // Escape closes the result list without clearing what was typed. Reset on
  // every keystroke so typing again reopens it.
  const [dismissed, setDismissed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  // Which control to focus after `selected` flips, so a keyboard user is never
  // left with focus on an element that just unmounted.
  const focusAfterChange = useRef<"input" | "change" | null>(null);
  const [createForm, setCreateForm] = useState<PersonFormState>(() =>
    emptyPersonForm(newPersonRole, pickerPersonType),
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();

  const candidatePeople = onlyOrganizations
    ? people.filter(isOrganization)
    : people;

  function updateCreateForm<K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setQuery("");
    setDismissed(false);
    setShowCreate(false);
    setCreateForm(emptyPersonForm(newPersonRole, pickerPersonType));
    setCreateError(null);
  }

  // Picking a person swaps the search field for the chip, and "Change" swaps
  // it back. Either way the focused element unmounts, which drops focus to
  // <body> -- so move it to whatever replaced it.
  useEffect(() => {
    const target = focusAfterChange.current;
    if (!target) return;
    focusAfterChange.current = null;
    if (target === "change") changeButtonRef.current?.focus();
    else inputRef.current?.focus();
  }, [selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{personDisplayName(selected)}</p>
            <PersonAccountBadge person={selected} />
          </div>
          {selected.email && (
            <p className="app-muted text-xs">{selected.email}</p>
          )}
        </div>
        {/* The chip replaces the search field in place, which a screen
            reader has no reason to announce. Say what was picked. */}
        <p className="sr-only" role="status">
          {personDisplayName(selected)} selected.
        </p>
        <Button
          ref={changeButtonRef}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            focusAfterChange.current = "input";
            onSelect(null);
            reset();
          }}
        >
          Change
        </Button>
      </div>
    );
  }

  const normalizedQuery = query.trim();
  const matches = filterPeople(candidatePeople, query);
  const visibleMatches = matches.slice(0, 8);
  const listOpen = visibleMatches.length > 0 && !dismissed;

  function handleCreateSubmit() {
    setCreateError(null);

    startCreateTransition(async () => {
      await runAction(
        () => createPersonAction(packPersonFormData(createForm)),
        {
          success: (result) =>
            `${personDisplayName(result.person)} added to people.`,
          onError: setCreateError,
          onSuccess: (result) => {
            if (!result.person) return;
            // Same as picking from the list: the create form unmounts, so
            // focus needs somewhere to land.
            focusAfterChange.current = "change";
            onPersonCreated(result.person);
            onSelect(result.person);
            reset();
          },
        },
      );
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {/*
        Base UI's Autocomplete rather than the input-plus-buttons this used to
        be: it supplies the combobox/listbox roles and moves the highlight with
        the arrow keys while focus stays in the input, so a screen reader can
        follow along via aria-activedescendant (issue #567).

        Deliberately no Portal/Positioner/Popup. Rendering the list in normal
        flow keeps it inside the focus trap of whichever Dialog or Sheet holds
        the picker, and out of reach of DialogContent's overflow-y-auto and its
        translate transform -- both of which a fixed-position popup would have
        to fight.
      */}
      <Autocomplete.Root
        value={query}
        onValueChange={(next) => {
          setQuery(next ?? "");
          setDismissed(false);
        }}
        open={listOpen}
        onOpenChange={(next) => setDismissed(!next)}
        // filterPeople already matched on legal name, preferred name and
        // email; a second pass would only narrow it further.
        filter={null}
        items={visibleMatches}
        itemToStringValue={(person: PersonListItem) =>
          personDisplayName(person)
        }
      >
        <Autocomplete.Input
          ref={inputRef}
          id={id}
          aria-label={ariaLabel}
          aria-required={required || undefined}
          placeholder={placeholder}
          onKeyDown={(event) => {
            // Close the list, not the surrounding dialog. Base UI hangs both
            // Escape handlers off `document`, and combobox and dialog are not
            // in one floating tree, so stopping here -- inside the React root
            // -- is what keeps the first Escape local. A second one, with the
            // list already closed, falls through and closes the dialog.
            if (event.key !== "Escape" || !listOpen) return;
            event.preventDefault();
            event.stopPropagation();
            setDismissed(true);
          }}
          render={<Input />}
        />

        {listOpen && (
          <Autocomplete.List className="flex flex-col divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
            {(person: PersonListItem) => (
              <Autocomplete.Item
                key={person.id}
                value={person}
                // Same highlight contract as the command palette: the tint
                // is only 1.25:1, so the inset ring is what makes the
                // keyboard position visible (1.4.11). `--muted` is
                // `--purple-soft` -- one name for the tint, not two.
                className="flex cursor-default flex-col items-start px-3 py-2 text-left text-sm outline-none data-highlighted:inset-ring-2 data-highlighted:inset-ring-ring data-highlighted:bg-muted"
                onClick={() => {
                  focusAfterChange.current = "change";
                  onSelect(person);
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">
                    {personDisplayName(person)}
                  </span>
                  <PersonAccountBadge person={person} />
                </span>
                {person.email && (
                  <span className="app-muted text-xs">{person.email}</span>
                )}
              </Autocomplete.Item>
            )}
          </Autocomplete.List>
        )}

        {/* Always mounted: Base UI announces through this live region, and a
            region that appears at the same moment as its text is not read. */}
        <Autocomplete.Empty>
          {normalizedQuery && matches.length === 0 && !showCreate ? (
            <p className="app-muted text-sm">
              No matches for &quot;{query}&quot;.
            </p>
          ) : null}
        </Autocomplete.Empty>
      </Autocomplete.Root>

      {!allowCreate ? null : !showCreate ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setShowCreate(true)}
        >
          + Create new {onlyOrganizations ? "organization" : "person"}
        </Button>
      ) : (
        <div className="rounded-md border border-[var(--line)] p-3">
          <FieldGroup>
            <RequiredFieldsNote />
            <PersonFormFields
              form={createForm}
              update={updateCreateForm}
              idPrefix="picker-new-person"
            />

            {createError && (
              <Alert variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateSubmit}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Spinner /> Creating...
                  </>
                ) : (
                  "Create & select"
                )}
              </Button>
            </div>
          </FieldGroup>
        </div>
      )}
    </div>
  );
}
