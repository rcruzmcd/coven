"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { wrapStop } from "@/lib/inventory-category-colors";
import { setInventoryCategoryAccentAction } from "./actions";

const AUTO = "auto";

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 shrink-0 rounded-full border border-[var(--line)]"
      style={{ background: color }}
    />
  );
}

/**
 * A group's or category's colour, one of the tenant's accent stops (#1907).
 * "Automatic" stores null: a group then takes its place in the cycle and a
 * category its group's colour, which `inheritedStop` names so the option
 * shows the colour it means rather than a word.
 */
export function CategoryColorPicker({
  kind,
  id,
  name,
  stop,
  inheritedStop,
  stops,
  canManage,
}: {
  kind: "group" | "category";
  id: string;
  /** The group or category label, for the control's accessible name. */
  name: string;
  stop: number | null;
  inheritedStop: number;
  stops: readonly string[];
  canManage: boolean;
}) {
  const [value, setValue] = useState(stop === null ? AUTO : String(stop));
  const [pending, startTransition] = useTransition();
  const autoLabel = kind === "group" ? "Automatic" : "Same as group";
  const inheritedColor = stops[wrapStop(inheritedStop, stops.length)];
  const colorFor = (v: string) =>
    v === AUTO ? inheritedColor : stops[wrapStop(Number(v), stops.length)];
  const labelFor = (v: string) =>
    v === AUTO ? autoLabel : `Color ${wrapStop(Number(v), stops.length) + 1}`;

  if (!canManage) {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <Swatch color={colorFor(value)} />
        {labelFor(value)}
      </span>
    );
  }

  function onChange(next: string | null) {
    if (next === null || next === value) return;
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await setInventoryCategoryAccentAction(
        kind,
        id,
        next === AUTO ? null : Number(next),
      );
      if ("error" in result) {
        setValue(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        size="sm"
        className="w-44"
        aria-label={`Color for ${name}`}
      >
        <SelectValue>
          {(v: string) => (
            <span className="inline-flex items-center gap-2">
              <Swatch color={colorFor(v)} />
              {labelFor(v)}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO}>
          <span className="inline-flex items-center gap-2">
            <Swatch color={inheritedColor} />
            {autoLabel}
          </span>
        </SelectItem>
        {stops.map((color, index) => (
          <SelectItem key={index} value={String(index)}>
            <span className="inline-flex items-center gap-2">
              <Swatch color={color} />
              Color {index + 1}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
