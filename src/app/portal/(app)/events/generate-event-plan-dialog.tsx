"use client";

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { runAction } from "@/components/portal/action-toast";
import { ViewerTime } from "@/components/viewer-time";
import {
  planEventPosts,
  type EventPlanTemplateEntry,
} from "@/lib/social-content/event-plan";
import { generateEventPlanAction } from "@/lib/social-content/piece-actions";

function offsetLabel(days: number) {
  if (days === 0) return "Day of the event";
  const count = Math.abs(days);
  const unit = count === 1 ? "day" : "days";
  return days < 0 ? `${count} ${unit} before` : `${count} ${unit} after`;
}

/**
 * Generate plan (#1798): previews the tenant's starter posts against this
 * event's start, with a checkbox each, and creates the ticked ones. A post the
 * event already has (by title) is listed but not offered.
 */
export function GenerateEventPlanDialog({
  eventId,
  startsAt,
  template,
  timeZone,
  leadTimeDays,
  existingTitles,
}: {
  eventId: string;
  startsAt: string;
  template: EventPlanTemplateEntry[];
  timeZone: string;
  leadTimeDays: number;
  existingTitles: string[];
}) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const plan = useMemo(
    () =>
      planEventPosts({
        template,
        startsAt,
        timeZone,
        leadTimeDays,
        existingTitles,
      }),
    [template, startsAt, timeZone, leadTimeDays, existingTitles],
  );
  const offered = plan.filter((post) => !post.exists);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setSelected(new Set(offered.map((post) => post.title)));
    }
  }

  function toggle(title: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(title);
      else next.delete(title);
      return next;
    });
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);
    startTransition(async () => {
      await runAction(() => generateEventPlanAction(eventId, [...selected]), {
        success: ({ created }) =>
          `${created} social ${created === 1 ? "post" : "posts"} added.`,
        onError: setError,
        onSuccess: () => {
          setOpen(false);
          router.refresh();
        },
      });
    });
  }

  const count = offered.filter((post) => selected.has(post.title)).length;

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" variant="secondary" size="sm">
          <Sparkles /> Generate plan
        </Button>
      }
      title="Generate a post plan"
      description="Draft posts timed around this event. Untick any you don't want; dates can be changed afterwards."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending || count === 0}>
            {isPending ? <Spinner /> : null}
            {count > 0
              ? `Add ${count} ${count === 1 ? "post" : "posts"}`
              : "Add posts"}
          </Button>
        </>
      }
    >
      <div className="py-2">
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {offered.length === 0 && (
            <p className="app-muted text-sm" role="status">
              This event already has every post in the plan.
            </p>
          )}
          {plan.map((post, index) => {
            const id = `${fieldId}-${index}`;
            return (
              <Field key={post.title} orientation="horizontal">
                <Checkbox
                  id={id}
                  checked={!post.exists && selected.has(post.title)}
                  disabled={post.exists}
                  onCheckedChange={(checked) =>
                    toggle(post.title, checked === true)
                  }
                />
                <FieldLabel
                  htmlFor={id}
                  className="flex flex-col items-start gap-0.5 font-normal"
                >
                  <span className="font-medium">{post.title}</span>
                  <span className="app-muted text-xs">
                    {post.exists ? (
                      "Already planned"
                    ) : (
                      <>
                        {offsetLabel(post.offsetDays)} ·{" "}
                        <ViewerTime
                          iso={post.publishDueAt}
                          fallbackZone={timeZone}
                        />
                      </>
                    )}
                  </span>
                </FieldLabel>
              </Field>
            );
          })}
        </FieldGroup>
      </div>
    </PortalFormSurface>
  );
}
