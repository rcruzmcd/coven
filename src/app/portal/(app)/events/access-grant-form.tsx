"use client";

import { FormEvent, useId, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EventAccessArea } from "@/lib/auth/event-access";
import type {
  EventAccessAreaOption,
  EventAccessCandidate,
  EventAccessInput,
} from "./event-access-shared";

export type GrantWho = { userId: string } | { email: string };

const LEVEL_LABELS = {
  view: "View",
  manage: "Manage",
} as const;

/**
 * The level and areas of one grant (#1689), and -- for a new one -- who it is
 * for: an account in the organization, or an address to invite. Only offered
 * areas can be picked; an area the grant already holds that the tenant has
 * since withdrawn is listed so it can be removed, and says it reaches nothing.
 */
export function AccessGrantForm({
  areas,
  initial,
  candidates,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  areas: EventAccessAreaOption[];
  initial: EventAccessInput;
  /** The account picker's options; omitted when editing an existing grant. */
  candidates?: EventAccessCandidate[];
  submitLabel: string;
  onSubmit: (
    input: EventAccessInput,
    who: GrantWho | null,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const id = useId();
  const [mode, setMode] = useState<"account" | "email">(
    candidates && candidates.length > 0 ? "account" : "email",
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState(initial.level);
  const [picked, setPicked] = useState<EventAccessArea[]>(initial.areas);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const listed = areas.filter(
    (area) => area.offered || initial.areas.includes(area.key),
  );

  function toggle(key: EventAccessArea, on: boolean) {
    setPicked((current) =>
      on ? [...current, key] : current.filter((value) => value !== key),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    let who: GrantWho | null = null;
    if (candidates) {
      if (mode === "account") {
        if (!userId) {
          setError("Pick an account.");
          return;
        }
        who = { userId };
      } else {
        if (!email.trim()) {
          setError("Enter an email address.");
          return;
        }
        who = { email };
      }
    }
    if (picked.length === 0) {
      setError("Pick at least one area.");
      return;
    }
    startTransition(async () => {
      const result = await onSubmit({ level, areas: picked }, who);
      if ("error" in result) setError(result.error);
    });
  }

  const candidateLabel = (value: string | null) => {
    const candidate = candidates?.find((entry) => entry.user_id === value);
    if (!candidate) return "Choose an account";
    return candidate.name
      ? `${candidate.name} (${candidate.email})`
      : candidate.email;
  };

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        {candidates && (
          <FieldSet>
            <FieldLegend variant="label">Who</FieldLegend>
            <ToggleGroup
              value={[mode]}
              onValueChange={(value) => {
                const next = value[0];
                if (next === "account" || next === "email") setMode(next);
              }}
              variant="outline"
            >
              <ToggleGroupItem
                value="account"
                disabled={candidates.length === 0}
              >
                Existing account
              </ToggleGroupItem>
              <ToggleGroupItem value="email">Invite by email</ToggleGroupItem>
            </ToggleGroup>
            {mode === "account" ? (
              <Field>
                <FieldLabel htmlFor={`${id}-account`} className="sr-only">
                  Account
                </FieldLabel>
                <Select
                  value={userId}
                  onValueChange={(value) => setUserId(value as string | null)}
                >
                  <SelectTrigger id={`${id}-account`} className="w-full">
                    <SelectValue>{candidateLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((candidate) => (
                      <SelectItem
                        key={candidate.user_id}
                        value={candidate.user_id}
                      >
                        {candidateLabel(candidate.user_id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor={`${id}-email`}>Email</FieldLabel>
                <Input
                  id={`${id}-email`}
                  type="email"
                  autoComplete="off"
                  placeholder="coordinator@partner.org"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <FieldDescription>
                  They get an email with a link to set up their account. Their
                  access starts when they first sign in.
                </FieldDescription>
              </Field>
            )}
          </FieldSet>
        )}

        <Field>
          <FieldLabel htmlFor={`${id}-level`}>Level</FieldLabel>
          <Select
            value={level}
            onValueChange={(value) => setLevel(value as "view" | "manage")}
          >
            <SelectTrigger id={`${id}-level`} className="w-full">
              <SelectValue>
                {(value: "view" | "manage") => LEVEL_LABELS[value]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="view">View</SelectItem>
              <SelectItem value="manage">Manage</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>
            {level === "manage"
              ? "They can see and edit the areas below."
              : "They can see the areas below but not change them."}
          </FieldDescription>
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Areas</FieldLegend>
          <FieldGroup className="gap-3">
            {listed.map((area) => (
              <Field key={area.key} orientation="horizontal">
                <Checkbox
                  id={`${id}-area-${area.key}`}
                  checked={picked.includes(area.key)}
                  onCheckedChange={(checked) =>
                    toggle(area.key, checked === true)
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-area-${area.key}`}>
                    {area.label}
                    {area.sensitive && (
                      <Badge variant="warning">Sensitive</Badge>
                    )}
                    {!area.offered && (
                      <Badge variant="muted">Not offered</Badge>
                    )}
                  </FieldLabel>
                  <FieldDescription>
                    {area.offered
                      ? area.description
                      : "No longer offered, so it gives no access. Uncheck to remove it."}
                  </FieldDescription>
                </FieldContent>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} focusableWhenDisabled>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
