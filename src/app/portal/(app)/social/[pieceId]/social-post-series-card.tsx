"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useActionToast } from "@/components/portal/action-toast";
import { ViewerTime } from "@/components/viewer-time";
import { formatCalendarDate } from "@/lib/format";
import { todayInZone } from "@/lib/time";
import type { SocialPieceRow } from "@/lib/social-content/queries";
import {
  SERIES_CADENCES,
  anchorFromPublishAt,
  cadenceLabel,
  occurrencePublishAt,
  occurrencesFrom,
  seriesState,
  type SeriesCadence,
  type SocialPostSeriesRow,
} from "@/lib/social-content/series";
import {
  createSeriesFromPostAction,
  setSeriesAutoApproveAction,
  setSeriesStateAction,
  updateSeriesScheduleAction,
  updateSeriesTemplateFromPostAction,
} from "@/lib/social-content/series-actions";

const NO_REPEAT = "none";
const UPCOMING_COUNT = 4;
/** The newest missed dates the card lists (#1840). */
const MISSED_SHOWN = 5;

const STATE_LABELS = {
  active: "Active",
  paused: "Paused",
  ended: "Ended",
} as const;

/**
 * Whether a post repeats (#1839): make it repeat from its publish date, or,
 * once it does, the series' next dates and its settings. The posts the series
 * adds are created by the scheduled generator (#1840).
 */
export function SocialPostSeriesCard({
  piece,
  orgTimeZone,
  canManage,
}: {
  piece: SocialPieceRow;
  orgTimeZone: string;
  canManage: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted flex items-center gap-1.5 text-sm font-semibold">
          <Repeat className="size-4" aria-hidden />
          Repeats
        </CardTitle>
      </CardHeader>
      <CardContent>
        {piece.series ? (
          <SeriesDetails
            postId={piece.id}
            series={piece.series}
            canManage={canManage}
          />
        ) : (
          <MakeRepeat
            piece={piece}
            orgTimeZone={orgTimeZone}
            canManage={canManage}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CadenceFields({
  idPrefix,
  anchorDate,
  cadence,
  endsOn,
  allowNone,
  disabled,
  onCadenceChange,
  onEndsOnChange,
}: {
  idPrefix: string;
  anchorDate: string;
  cadence: string;
  endsOn: string;
  allowNone: boolean;
  disabled: boolean;
  onCadenceChange: (value: string) => void;
  onEndsOnChange: (value: string) => void;
}) {
  const options = [
    ...(allowNone ? [{ value: NO_REPEAT, label: "Doesn't repeat" }] : []),
    ...SERIES_CADENCES.map((option) => ({
      value: option.value,
      label: cadenceLabel(option.value, anchorDate),
    })),
  ];
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-cadence`}>Repeat</FieldLabel>
        <Select
          value={cadence}
          onValueChange={(next) => onCadenceChange(next ?? cadence)}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-cadence`} className="w-full">
            <SelectValue>
              {(value: string) =>
                options.find((option) => option.value === value)?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {cadence !== NO_REPEAT && (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-ends-on`}>Ends on</FieldLabel>
          <Input
            id={`${idPrefix}-ends-on`}
            type="date"
            min={anchorDate}
            value={endsOn}
            onChange={(event) => onEndsOnChange(event.target.value)}
            disabled={disabled}
          />
          <FieldDescription>Leave empty to keep repeating.</FieldDescription>
        </Field>
      )}
    </>
  );
}

function MakeRepeat({
  piece,
  orgTimeZone,
  canManage,
}: {
  piece: SocialPieceRow;
  orgTimeZone: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [cadence, setCadence] = useState<string>(NO_REPEAT);
  const [endsOn, setEndsOn] = useState("");

  if (!piece.publish_due_at) {
    return (
      <p className="app-muted text-sm">
        Doesn&apos;t repeat.
        {canManage && " Set a publish date to make it repeat."}
      </p>
    );
  }
  if (!canManage) {
    return <p className="app-muted text-sm">Doesn&apos;t repeat.</p>;
  }

  const { anchor_date } = anchorFromPublishAt(
    piece.publish_due_at,
    orgTimeZone,
  );

  function save() {
    run(() => createSeriesFromPostAction(piece.id, cadence, endsOn || null), {
      success: "This post now repeats.",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <FieldGroup>
      <CadenceFields
        idPrefix="series-new"
        anchorDate={anchor_date}
        cadence={cadence}
        endsOn={endsOn}
        allowNone
        disabled={isPending}
        onCadenceChange={setCadence}
        onEndsOnChange={setEndsOn}
      />
      {cadence !== NO_REPEAT && (
        <>
          <p className="app-muted text-xs">
            Counted from this post&apos;s publish date. New posts start as
            drafts copied from this one, ready for review.
          </p>
          <div>
            <Button type="button" size="sm" onClick={save} disabled={isPending}>
              Make it repeat
            </Button>
          </div>
        </>
      )}
    </FieldGroup>
  );
}

function SeriesDetails({
  postId,
  series,
  canManage,
}: {
  postId: string;
  series: SocialPostSeriesRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [editing, setEditing] = useState(false);
  const [cadence, setCadence] = useState<SeriesCadence>(series.cadence);
  const [endsOn, setEndsOn] = useState(series.ends_on ?? "");
  const [confirming, setConfirming] = useState<"end" | "template" | null>(null);
  const state = seriesState(series);
  const refresh = () => router.refresh();

  const upcoming =
    state === "ended"
      ? []
      : occurrencesFrom(series, todayInZone(series.time_zone), UPCOMING_COUNT);

  function saveSchedule() {
    run(() => updateSeriesScheduleAction(series.id, cadence, endsOn || null), {
      success: "Series updated.",
      onSuccess: () => {
        setEditing(false);
        refresh();
      },
    });
  }

  function confirm() {
    const action = confirming;
    setConfirming(null);
    if (action === "end") {
      run(() => setSeriesStateAction(series.id, "end"), {
        success: "Series ended.",
        onSuccess: refresh,
      });
    } else if (action === "template") {
      run(() => updateSeriesTemplateFromPostAction(postId), {
        success: "Future posts will start from this one.",
        onSuccess: refresh,
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {cadenceLabel(series.cadence, series.anchor_date)}
        </span>
        <Badge variant={state === "active" ? "secondary" : "outline"}>
          {STATE_LABELS[state]}
        </Badge>
      </div>
      {series.ends_on && (
        <p className="app-muted text-xs">
          Ends on {formatCalendarDate(series.ends_on)}.
        </p>
      )}

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="app-muted text-xs font-semibold">
            {state === "paused" ? "Next dates once resumed" : "Next dates"}
          </h3>
          <ul className="flex flex-col gap-0.5 text-sm">
            {upcoming.map((day) => (
              <li key={day}>
                <ViewerTime
                  iso={occurrencePublishAt(series, day)}
                  fallbackZone={series.time_zone}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {series.missed_occurrences.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="app-muted text-xs font-semibold">Not created</h3>
          <p className="app-muted text-xs">
            These dates had passed before their post could be made, so they were
            skipped:{" "}
            {series.missed_occurrences
              .slice(-MISSED_SHOWN)
              .map((day) => formatCalendarDate(day))
              .join(", ")}
            .
          </p>
        </div>
      )}

      {canManage && state !== "ended" && (
        <FieldGroup>
          {editing ? (
            <>
              <CadenceFields
                idPrefix="series-edit"
                anchorDate={series.anchor_date}
                cadence={cadence}
                endsOn={endsOn}
                allowNone={false}
                disabled={isPending}
                onCadenceChange={(value) => setCadence(value as SeriesCadence)}
                onEndsOnChange={setEndsOn}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={saveSchedule}
                  disabled={isPending}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCadence(series.cadence);
                    setEndsOn(series.ends_on ?? "");
                    setEditing(false);
                  }}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <Field orientation="horizontal">
              <Switch
                id="series-auto-approve"
                checked={series.auto_approve}
                disabled={isPending}
                onCheckedChange={(checked) =>
                  run(() => setSeriesAutoApproveAction(series.id, checked), {
                    success: checked
                      ? "New posts will skip review."
                      : "New posts will need review.",
                    onSuccess: refresh,
                  })
                }
              />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="series-auto-approve">
                  Auto-approve new posts
                </FieldLabel>
                <FieldDescription>
                  New posts in this series start approved and skip review.
                </FieldDescription>
              </div>
            </Field>
          )}

          {!editing && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setEditing(true)}
                disabled={isPending}
              >
                Change repeat
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  run(
                    () =>
                      setSeriesStateAction(
                        series.id,
                        state === "paused" ? "resume" : "pause",
                      ),
                    {
                      success:
                        state === "paused"
                          ? "Series resumed."
                          : "Series paused.",
                      onSuccess: refresh,
                    },
                  )
                }
                disabled={isPending}
              >
                {state === "paused" ? "Resume" : "Pause"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setConfirming("template")}
                disabled={isPending}
              >
                Use this post for future posts
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirming("end")}
                disabled={isPending}
              >
                End series
              </Button>
            </div>
          )}
        </FieldGroup>
      )}
      {canManage && !editing && (
        <p className="app-muted text-xs">
          Changes to the series apply to posts it hasn&apos;t created yet. Posts
          already created are edited one at a time.
        </p>
      )}

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "end"
                ? "End this series?"
                : "Use this post for future posts?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "end"
                ? "No more posts will be created. Posts already created stay as they are. An ended series can't be restarted."
                : "Posts the series creates from now on will copy this post's title, caption, format, collaborators, tags, people and links. Posts already created keep their own."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>
              {confirming === "end" ? "End series" : "Use this post"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
