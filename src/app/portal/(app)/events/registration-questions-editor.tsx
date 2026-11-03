"use client";

import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { MAX_QUESTIONS, QUESTION_KINDS } from "@/lib/registration-questions";
import { normalizeConditions, newQuestionDraft } from "@/lib/question-drafts";
import { QuestionList } from "@/components/portal/question-editor";
import {
  listEventOptionsAction,
  listCopyableRegistrationQuestionsAction,
  type EventOption,
} from "./actions";
import {
  copyQuestions,
  type QuestionDraft,
} from "./registration-questions-draft";

/** The registrants list is where an event's column names show (#1512). */
const COLUMN_LABEL = {
  label: "Column name in the registrants list",
  description:
    "A word or two, like “Carpool”. Left blank, the list shows the start of the prompt.",
  followUp:
    "A follow-up shows in the column of the question it depends on, after its answer. For a number, this is its unit, like “seats”.",
};

/**
 * An event's registration questions (#1501), edited on the Planning tab under
 * the #1407 options question and saved with the rest of the tab. Unlike those
 * options, there is no tenant default copied onto new events: questions are
 * specific to an event (and often to a partner running part of it), so the
 * reuse path is "Copy from another event" here, which staff review and save
 * like anything typed in by hand.
 */
export function RegistrationQuestionsEditor({
  eventId,
  value,
  onChange,
  disabled,
}: {
  eventId: string;
  value: QuestionDraft[];
  onChange: (value: QuestionDraft[]) => void;
  disabled?: boolean;
}) {
  function setQuestions(next: QuestionDraft[]) {
    onChange(normalizeConditions(next));
  }

  return (
    <FieldSet>
      <FieldLegend variant="label">Additional questions</FieldLegend>
      <FieldDescription>
        Optional. Asked once per registration. Deleting a question that has
        answers archives it, so the answers are kept.
      </FieldDescription>

      <QuestionList
        value={value}
        onChange={onChange}
        idPrefix="planning"
        kinds={QUESTION_KINDS}
        columnLabel={COLUMN_LABEL}
        disabled={disabled}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || value.length >= MAX_QUESTIONS}
          onClick={() => setQuestions([...value, newQuestionDraft()])}
        >
          <Plus /> Add question
        </Button>
        <CopyQuestionsDialog
          eventId={eventId}
          disabled={disabled}
          onCopy={(copied) => setQuestions([...value, ...copied])}
        />
      </div>
    </FieldSet>
  );
}

/**
 * Picks another event and appends copies of its current questions. Nothing is
 * saved here: the copies land in the editor for staff to review, and the
 * Planning tab's Save writes them like any other edit.
 */
function CopyQuestionsDialog({
  eventId,
  disabled,
  onCopy,
}: {
  eventId: string;
  disabled?: boolean;
  onCopy: (questions: QuestionDraft[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSourceId(null);
      setError(null);
      return;
    }
    // Loaded on open rather than with the page: most visits never copy.
    if (events === null) {
      listEventOptionsAction().then((result) => {
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setEvents(result.data.filter((event) => event.id !== eventId));
      });
    }
  }

  async function handleCopy() {
    if (!sourceId) return;
    setError(null);
    setLoading(true);
    const result = await listCopyableRegistrationQuestionsAction(sourceId);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (result.data.length === 0) {
      setError("That event asks no registration questions.");
      return;
    }
    onCopy(copyQuestions(result.data));
    handleOpenChange(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
      >
        <Copy /> Copy from another event
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy questions from another event</DialogTitle>
            <DialogDescription>
              Its current questions are added below this event&apos;s, with
              their conditions. Nothing is saved until you save the Planning
              tab.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="planning-copy-questions-event">
              Event
            </FieldLabel>
            <Select
              value={sourceId}
              disabled={events === null}
              onValueChange={(next) => setSourceId((next as string) ?? null)}
            >
              <SelectTrigger
                id="planning-copy-questions-event"
                className="w-full"
              >
                <SelectValue>
                  {(selected: string | null) =>
                    events === null
                      ? "Loading…"
                      : (events.find((event) => event.id === selected)?.name ??
                        "Pick an event")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(events ?? []).map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!sourceId || loading}
              onClick={handleCopy}
            >
              {loading ? (
                <>
                  <Spinner /> Copying...
                </>
              ) : (
                "Copy questions"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
