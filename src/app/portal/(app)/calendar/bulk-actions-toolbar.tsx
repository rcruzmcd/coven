"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CALENDAR_STATUSES, DECISIONS, VISIBILITIES } from "./calendar-shared";
import {
  updateCalendarItemsDecisionAction,
  updateCalendarItemsStatusAction,
  updateCalendarItemsVisibilityAction,
} from "./actions";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";

const FIELDS = [
  {
    value: "calendarStatus",
    label: "Calendar status",
    options: CALENDAR_STATUSES,
  },
  { value: "visibility", label: "Visibility", options: VISIBILITIES },
  { value: "decision", label: "Decision", options: DECISIONS },
] as const;

type FieldKey = (typeof FIELDS)[number]["value"];

export function BulkActionsToolbar({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [field, setField] = useState<FieldKey>("calendarStatus");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeField = FIELDS.find((option) => option.value === field)!;

  function handleFieldChange(next: FieldKey) {
    setField(next);
    setValue("");
    setError(null);
  }

  function handleApply() {
    if (!value) return;
    setError(null);
    const count = selectedIds.length;
    const valueLabel =
      activeField.options.find((option) => option.value === value)?.label ??
      value;
    startTransition(async () => {
      await runAction(
        () =>
          field === "visibility"
            ? updateCalendarItemsVisibilityAction(selectedIds, value)
            : field === "decision"
              ? updateCalendarItemsDecisionAction(selectedIds, value)
              : updateCalendarItemsStatusAction(selectedIds, value),
        {
          success: `${count} item${count === 1 ? "" : "s"} set to ${valueLabel}.`,
          onError: setError,
          onSuccess: () => {
            setValue("");
            onDone();
            router.refresh();
          },
        },
      );
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b bg-muted/40 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {selectedIds.length} selected
        </span>
        <Select
          value={field}
          onValueChange={(next) =>
            handleFieldChange((next ?? field) as FieldKey)
          }
        >
          <SelectTrigger
            size="sm"
            className="w-40"
            aria-label="Field to update"
          >
            <SelectValue placeholder="Set field…" />
          </SelectTrigger>
          <SelectContent>
            {FIELDS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={value} onValueChange={(next) => setValue(next ?? "")}>
          <SelectTrigger
            size="sm"
            className="w-48"
            aria-label={`Set ${activeField.label.toLowerCase()} to`}
          >
            <SelectValue
              placeholder={`Set ${activeField.label.toLowerCase()} to…`}
            />
          </SelectTrigger>
          <SelectContent>
            {activeField.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!value || isPending}
          onClick={handleApply}
        >
          {isPending ? (
            <>
              <Spinner /> Applying...
            </>
          ) : (
            "Apply"
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          focusableWhenDisabled
          onClick={onDone}
        >
          Clear selection
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
