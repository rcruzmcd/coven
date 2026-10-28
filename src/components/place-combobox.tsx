"use client";

import { useEffect, useRef, useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  searchPlacesAction,
  type PlaceOption,
  type PlaceSearchGranularity,
} from "@/lib/places/search-places-action";

/** The "Not listed" entry, always last when a question offers it. */
export const NOT_LISTED: PlaceOption = {
  id: "not-listed",
  kind: "other",
  label: "Not listed",
};

const SEARCH_DELAY_MS = 200;

const isZip = (query: string) => /^\d{5}$/.test(query.trim());

/**
 * What the list shows for a place: "Ironbound (Newark, Essex Co., NJ)" when
 * an alias found it (#1700), so the registrant sees why. The input and the
 * answer keep the place's own label.
 */
export function placeOptionText(option: PlaceOption): string {
  return option.matched ? `${option.matched} (${option.label})` : option.label;
}

/**
 * An autocomplete over the places reference table (#1699). Searches after the
 * second character, debounced; results come back ranked with the tenant's
 * service area first. Five digits are a ZIP and list the places it covers,
 * since a ZIP crosses town lines (#1700). With `allowNotListed`, "Not listed" is always offered,
 * so nobody is blocked by a place the dataset does not have.
 */
export function PlaceCombobox({
  id,
  granularity,
  value,
  onChange,
  allowNotListed = false,
  required,
  disabled,
  placeholder = "Start typing a city, town or ZIP",
  labelledBy,
  describedBy,
}: {
  id: string;
  granularity: PlaceSearchGranularity;
  value: PlaceOption | null;
  onChange: (value: PlaceOption | null) => void;
  allowNotListed?: boolean;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Where no `<label htmlFor={id}>` names the input. */
  labelledBy?: string;
  describedBy?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceOption[]>([]);
  const [searching, setSearching] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const request = ++latest.current;
    const timer = setTimeout(
      async () => {
        if (trimmed.length < 2) {
          setResults([]);
          setSearching(false);
          return;
        }
        setSearching(true);
        const found = await searchPlacesAction(trimmed, granularity).catch(
          () => [],
        );
        // A slower earlier search must not replace a newer one's results.
        if (request !== latest.current) return;
        setResults(found);
        setSearching(false);
      },
      trimmed.length < 2 ? 0 : SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [query, granularity]);

  // The chosen place stays an item, so the input keeps showing its label
  // after the list moves on.
  const items = [
    ...(value &&
    value.id !== NOT_LISTED.id &&
    !results.some((r) => r.id === value.id)
      ? [value]
      : []),
    ...results,
    ...(allowNotListed ? [NOT_LISTED] : []),
  ];

  return (
    <Combobox<PlaceOption>
      items={items}
      filter={null}
      value={value}
      onValueChange={(next) => onChange(next ?? null)}
      onInputValueChange={(next) => setQuery(next)}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.id}
      isItemEqualToValue={(item, current) => item.id === current.id}
      disabled={disabled}
      required={required}
    >
      <ComboboxInput
        id={id}
        className="w-full"
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        showClear={value !== null}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {searching
            ? "Searching…"
            : query.trim().length < 2
              ? "Type at least two letters."
              : isZip(query)
                ? "No places found for that ZIP."
                : "No matching places."}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: PlaceOption) => (
            <ComboboxItem key={item.id} value={item}>
              {placeOptionText(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
