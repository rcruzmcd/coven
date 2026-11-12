"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWalkInCheckInAction } from "./registrants-actions";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { RegistrationOptionCountsField } from "@/components/registration-option-counts-field";
import {
  hasOptionAnswer,
  optionCountsError,
  type OptionCounts,
} from "@/lib/registration-options";
import { useRegistrationOptions } from "./use-registration-options";
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";
import { RegistrationQuestionsFields } from "@/components/registration-questions-fields";
import { answersError, type AnswerDraft } from "@/lib/registration-questions";
import {
  staffAnswersFromDraft,
  useRegistrationQuestions,
} from "./use-registration-questions";

export function CheckInWalkInDialog({
  eventId,
  triggerLabel = "+ Check in walk-in",
  triggerVariant = "secondary",
  triggerClassName,
  initialName,
  onSaved,
  open: controlledOpen,
  onOpenChange,
  withTrigger,
}: ControlledOpenProps & {
  eventId: string;
  triggerLabel?: string;
  /** `default` where this is the page's primary action: the registrants page. */
  triggerVariant?: "default" | "secondary";
  triggerClassName?: string;
  /**
   * Seeds the person search, for the phone check-in sheet's "no one matches"
   * walk-in (#1558): the name the door just typed is the name to look up.
   */
  initialName?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useControlledOpen(controlledOpen, onOpenChange);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
  const [partySize, setPartySize] = useState("1");
  // #1407. Optional for staff: left blank, the registration is "not asked".
  const [optionCounts, setOptionCounts] = useState<OptionCounts>({});
  const registrationOptions = useRegistrationOptions(eventId, open);
  // #1501. Optional for staff too, and never required.
  const [answerDraft, setAnswerDraft] = useState<AnswerDraft>({});
  const registrationQuestions = useRegistrationQuestions(eventId, open);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [open]);

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  function reset() {
    setSelectedPerson(null);
    setPartySize("1");
    setOptionCounts({});
    setAnswerDraft({});
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedPerson) {
      setError("Select or create a person to check in.");
      return;
    }
    const size = Number(partySize);
    if (!Number.isInteger(size) || size < 1) {
      setError("Party size must be at least 1.");
      return;
    }
    const answered = registrationOptions && hasOptionAnswer(optionCounts);
    const optionsError = answered
      ? optionCountsError(optionCounts, size)
      : null;
    if (optionsError) {
      setError(optionsError);
      return;
    }
    const answers = staffAnswersFromDraft(registrationQuestions, answerDraft);
    const answersInvalid = answers
      ? answersError(registrationQuestions, answers, { required: false })
      : null;
    if (answersInvalid) {
      setError(answersInvalid.message);
      return;
    }

    startTransition(async () => {
      const result = await createWalkInCheckInAction(
        eventId,
        selectedPerson,
        size,
        answered ? optionCounts : null,
        answers,
      );
      if ("error" in result) {
        setError(result.error.message);
        return;
      }
      handleOpenChange(false);
      toast.success("Walk-in checked in.");
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      withTrigger={withTrigger}
      trigger={
        <Button
          type="button"
          variant={triggerVariant}
          className={cn("shrink-0 whitespace-nowrap", triggerClassName)}
        >
          {triggerLabel}
        </Button>
      }
      title="Check in a walk-in"
      description="Check in someone who didn't pre-register."
      onSubmit={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Checking in...
              </>
            ) : (
              "Check in walk-in"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="walk-in-person">Walk-in</FieldLabel>
          <PersonPicker
            id="walk-in-person"
            people={people}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={handlePersonCreated}
            newPersonRole="is_attendee"
            initialQuery={initialName}
            placeholder="Search by name or email..."
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="walkin-party-size">Party size</FieldLabel>
          <Input
            id="walkin-party-size"
            type="number"
            min={1}
            step={1}
            value={partySize}
            onChange={(event) => setPartySize(event.target.value)}
          />
        </Field>

        {registrationOptions && (
          <RegistrationOptionCountsField
            idPrefix="walkin"
            question={registrationOptions}
            counts={optionCounts}
            onChange={setOptionCounts}
            partySize={Number(partySize)}
            required={false}
            allowFull
            description="One per person in the party. Leave blank if you didn't ask."
            disabled={isPending}
          />
        )}

        {registrationQuestions.length > 0 && (
          <RegistrationQuestionsFields
            idPrefix="walkin"
            questions={registrationQuestions}
            draft={answerDraft}
            onChange={setAnswerDraft}
            required={false}
            disabled={isPending}
          />
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
