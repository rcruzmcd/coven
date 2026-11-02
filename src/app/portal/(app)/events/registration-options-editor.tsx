"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** The most options one event may offer; save_event_registration_options() agrees. */
export const MAX_REGISTRATION_OPTIONS = 10;

export type RegistrationOptionDraft = {
  /** Stable across reorders, for React. */
  key: string;
  /** Null for an option not saved yet. */
  id: string | null;
  label: string;
  /** As typed; blank is uncapped. */
  cap: string;
  /** As typed, in dollars; blank is no price (#1589). */
  price: string;
};

export type RegistrationOptionsDraft = {
  prompt: string;
  options: RegistrationOptionDraft[];
};

/**
 * An event's registration question (#1407), edited on the Planning tab beside
 * capacity -- a cap on an option is the same kind of limit. A new event
 * arrives with the tenant's defaults already copied in; removing every option
 * removes the question.
 */
export function RegistrationOptionsEditor({
  value,
  onChange,
  disabled,
}: {
  value: RegistrationOptionsDraft;
  onChange: (value: RegistrationOptionsDraft) => void;
  disabled?: boolean;
}) {
  const { options } = value;

  function setOptions(next: RegistrationOptionDraft[]) {
    onChange({ ...value, options: next });
  }

  function update(index: number, patch: Partial<RegistrationOptionDraft>) {
    setOptions(
      options.map((option, i) =>
        i === index ? { ...option, ...patch } : option,
      ),
    );
  }

  function move(index: number, by: -1 | 1) {
    const next = [...options];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    setOptions(next);
  }

  return (
    <FieldSet>
      <FieldLegend variant="label">Per-person options</FieldLegend>
      <FieldDescription>
        Optional. Each registrant splits their party across these options. A cap
        closes an option once it&apos;s full. Prices aren&apos;t shown publicly;
        discount codes are valued against them.
      </FieldDescription>

      {options.length > 0 && (
        <Field>
          <FieldLabel htmlFor="planning-options-prompt" required>
            Question shown to registrants
          </FieldLabel>
          <Input
            id="planning-options-prompt"
            value={value.prompt}
            maxLength={300}
            required
            placeholder="e.g. What does each person need?"
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, prompt: event.target.value })
            }
          />
        </Field>
      )}

      <ol className="flex flex-col gap-2">
        {options.map((option, index) => (
          <li key={option.key} className="flex items-end gap-2">
            <Field className="flex-1">
              <FieldLabel
                htmlFor={`planning-option-${option.key}`}
                className={index === 0 ? undefined : "sr-only"}
                required
              >
                Option {index + 1}
              </FieldLabel>
              <Input
                id={`planning-option-${option.key}`}
                value={option.label}
                maxLength={120}
                required
                disabled={disabled}
                onChange={(event) =>
                  update(index, { label: event.target.value })
                }
              />
            </Field>
            <Field className="w-24 shrink-0">
              <FieldLabel
                htmlFor={`planning-option-cap-${option.key}`}
                className={index === 0 ? undefined : "sr-only"}
              >
                {index === 0 ? "Cap" : `Cap for option ${index + 1}`}
              </FieldLabel>
              <Input
                id={`planning-option-cap-${option.key}`}
                type="number"
                min={0}
                step={1}
                placeholder="None"
                value={option.cap}
                disabled={disabled}
                onChange={(event) => update(index, { cap: event.target.value })}
              />
            </Field>
            <Field className="w-28 shrink-0">
              <FieldLabel
                htmlFor={`planning-option-price-${option.key}`}
                className={index === 0 ? undefined : "sr-only"}
              >
                {index === 0 ? "Price ($)" : `Price for option ${index + 1}`}
              </FieldLabel>
              <Input
                id={`planning-option-price-${option.key}`}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="None"
                value={option.price}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { price: event.target.value })
                }
              />
            </Field>
            <div className="flex shrink-0">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move option ${index + 1} up`}
                      disabled={disabled || index === 0}
                      onClick={() => move(index, -1)}
                    />
                  }
                >
                  <ArrowUp />
                </TooltipTrigger>
                <TooltipContent>{`Move option ${index + 1} up`}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move option ${index + 1} down`}
                      disabled={disabled || index === options.length - 1}
                      onClick={() => move(index, 1)}
                    />
                  }
                >
                  <ArrowDown />
                </TooltipTrigger>
                <TooltipContent>{`Move option ${index + 1} down`}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove option ${index + 1}`}
                      disabled={disabled}
                      onClick={() =>
                        setOptions(options.filter((_, i) => i !== index))
                      }
                    />
                  }
                >
                  <Trash2 />
                </TooltipTrigger>
                <TooltipContent>{`Remove option ${index + 1}`}</TooltipContent>
              </Tooltip>
            </div>
          </li>
        ))}
      </ol>

      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || options.length >= MAX_REGISTRATION_OPTIONS}
          onClick={() =>
            setOptions([
              ...options,
              {
                key: crypto.randomUUID(),
                id: null,
                label: "",
                cap: "",
                price: "",
              },
            ])
          }
        >
          <Plus /> Add option
        </Button>
      </div>
    </FieldSet>
  );
}

/** What a saved question looks like as a draft. */
export function registrationOptionsDraft(
  prompt: string | null | undefined,
  options:
    | {
        id: string;
        label: string;
        cap: number | null;
        price?: number | string | null;
      }[]
    | undefined,
): RegistrationOptionsDraft {
  return {
    prompt: prompt ?? "",
    options: (options ?? []).map((option) => ({
      key: option.id,
      id: option.id,
      label: option.label,
      cap: option.cap === null ? "" : String(option.cap),
      price:
        option.price === null || option.price === undefined
          ? ""
          : String(option.price),
    })),
  };
}

/** Whether two drafts would save the same thing. Keys are not compared. */
export function sameRegistrationOptions(
  a: RegistrationOptionsDraft,
  b: RegistrationOptionsDraft,
): boolean {
  const shape = (draft: RegistrationOptionsDraft) =>
    JSON.stringify({
      prompt: draft.options.length > 0 ? draft.prompt.trim() : "",
      options: draft.options.map(({ id, label, cap, price }) => [
        id,
        label.trim(),
        cap.trim(),
        price.trim() === "" ? "" : String(Number(price)),
      ]),
    });
  return shape(a) === shape(b);
}
