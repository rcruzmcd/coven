"use client";

import { useEffect, useState } from "react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { CONDUCT_CHANNELS, CONDUCT_SEVERITIES } from "@/lib/conduct";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import {
  listConductEventOptionsAction,
  type ConductEventOption,
} from "./actions";

/**
 * The report's own fields, shared by recording one and correcting one.
 *
 * Everything that can identify somebody degrades rather than blocks: the
 * reporter and subject pickers appear only where the intake holder can read the
 * people directory, and the event picker only where they can read events, both
 * of which are separate grants from `conduct_reports`. Where they are missing
 * the free-text field beside them is the whole answer, which is also the right
 * answer for a subject who is not in the directory and should not be added to
 * it on the strength of having been complained about.
 */

export type ConductReportFormState = {
  receivedOn: string;
  channel: string;
  severity: string;
  reporterKind: "named" | "anonymous";
  reporter: PickedPerson | null;
  reporterName: string;
  reporterContact: string;
  subject: PickedPerson | null;
  subjectDescription: string;
  eventId: string;
  context: string;
  summary: string;
};

const NO_EVENT = "__none__";

export function emptyConductReportForm(today: string): ConductReportFormState {
  return {
    receivedOn: today,
    channel: "email",
    severity: "moderate",
    reporterKind: "named",
    reporter: null,
    reporterName: "",
    reporterContact: "",
    subject: null,
    subjectDescription: "",
    eventId: "",
    context: "",
    summary: "",
  };
}

export function packConductReportForm(state: ConductReportFormState): FormData {
  const formData = new FormData();
  formData.set("receivedOn", state.receivedOn);
  formData.set("channel", state.channel);
  formData.set("severity", state.severity);
  formData.set("reporterKind", state.reporterKind);
  formData.set("reporterPersonId", state.reporter?.id ?? "");
  formData.set("reporterName", state.reporterName);
  formData.set("reporterContact", state.reporterContact);
  formData.set("subjectPersonId", state.subject?.id ?? "");
  formData.set("subjectDescription", state.subjectDescription);
  formData.set("eventId", state.eventId);
  formData.set("context", state.context);
  formData.set("summary", state.summary);
  return formData;
}

export function ConductReportFormFields({
  idPrefix,
  state,
  onChange,
}: {
  idPrefix: string;
  state: ConductReportFormState;
  onChange: (next: Partial<ConductReportFormState>) => void;
}) {
  const [people, setPeople] = useState<PersonListItem[] | null>(null);
  const [events, setEvents] = useState<ConductEventOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [peopleResult, eventOptions] = await Promise.all([
        listPeopleAction(),
        listConductEventOptionsAction(),
      ]);
      if (cancelled) return;
      setPeople("data" in peopleResult ? peopleResult.data : []);
      setEvents(eventOptions);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const anonymous = state.reporterKind === "anonymous";
  const canPickPeople = (people?.length ?? 0) > 0;

  return (
    <FieldGroup>
      <RequiredFieldsNote />

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-received`} required>
          Date received
        </FieldLabel>
        <Input
          id={`${idPrefix}-received`}
          type="date"
          required
          value={state.receivedOn}
          onChange={(event) => onChange({ receivedOn: event.target.value })}
        />
        <p className="app-muted text-xs">
          When it reached your organization, not when you are typing it in.
          Every clock on the case counts from here.
        </p>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-channel`} required>
          How it arrived
        </FieldLabel>
        <Select
          value={state.channel}
          onValueChange={(value) => onChange({ channel: value ?? "email" })}
        >
          <SelectTrigger id={`${idPrefix}-channel`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDUCT_CHANNELS.map((channel) => (
              <SelectItem key={channel.value} value={channel.value}>
                {channel.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-reporter-kind`} required>
          Who reported it
        </FieldLabel>
        <Select
          value={state.reporterKind}
          onValueChange={(value) =>
            onChange({
              reporterKind: value === "anonymous" ? "anonymous" : "named",
            })
          }
        >
          <SelectTrigger id={`${idPrefix}-reporter-kind`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="named">Somebody who gave their name</SelectItem>
            <SelectItem value="anonymous">Anonymous</SelectItem>
          </SelectContent>
        </Select>
        {anonymous && (
          <p className="app-muted text-xs">
            Nothing that could identify the reporter is kept: a name, a contact
            or a directory link typed above is discarded when you save, and the
            database refuses one afterwards.
          </p>
        )}
      </Field>

      {!anonymous && (
        <>
          {canPickPeople && (
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-reporter`}>
                Reporter in the directory
              </FieldLabel>
              <PersonPicker
                id={`${idPrefix}-reporter`}
                people={people ?? []}
                selected={state.reporter}
                onSelect={(person) => onChange({ reporter: person })}
                onPersonCreated={() => undefined}
                allowCreate={false}
                placeholder="Search by name or email..."
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-reporter-name`}>
              Reporter
            </FieldLabel>
            <Input
              id={`${idPrefix}-reporter-name`}
              value={state.reporterName}
              onChange={(event) =>
                onChange({ reporterName: event.target.value })
              }
            />
            <p className="app-muted text-xs">
              For somebody who is not in your directory. Leave it blank if you
              picked them above.
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-reporter-contact`}>
              How to reach them
            </FieldLabel>
            <Input
              id={`${idPrefix}-reporter-contact`}
              value={state.reporterContact}
              onChange={(event) =>
                onChange({ reporterContact: event.target.value })
              }
            />
          </Field>
        </>
      )}

      {canPickPeople && (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-subject`}>
            Subject in the directory
          </FieldLabel>
          <PersonPicker
            id={`${idPrefix}-subject`}
            people={people ?? []}
            selected={state.subject}
            onSelect={(person) => onChange({ subject: person })}
            onPersonCreated={() => undefined}
            allowCreate={false}
            placeholder="Search by name or email..."
          />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-subject-description`}>
          Who it is about
        </FieldLabel>
        <Input
          id={`${idPrefix}-subject-description`}
          value={state.subjectDescription}
          onChange={(event) =>
            onChange({ subjectDescription: event.target.value })
          }
        />
        <p className="app-muted text-xs">
          In the reporter&rsquo;s words where you cannot name them — &ldquo;a
          coach in a red jacket&rdquo;. Nobody is added to your directory
          because a report named them.
        </p>
      </Field>

      {events.length > 0 && (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-event`}>Event</FieldLabel>
          <Select
            value={state.eventId || NO_EVENT}
            onValueChange={(value) =>
              onChange({ eventId: value === NO_EVENT ? "" : (value ?? "") })
            }
          >
            <SelectTrigger id={`${idPrefix}-event`} className="w-full">
              <SelectValue placeholder="Not at an event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_EVENT}>Not at an event</SelectItem>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-context`}>Where and when</FieldLabel>
        <Input
          id={`${idPrefix}-context`}
          value={state.context}
          onChange={(event) => onChange({ context: event.target.value })}
        />
        <p className="app-muted text-xs">
          For anything that was not one of your events — a ride, a workshop, a
          group chat, the car park.
        </p>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-summary`} required>
          What was reported
        </FieldLabel>
        <MarkdownTextarea
          id={`${idPrefix}-summary`}
          required
          rows={6}
          value={state.summary}
          onChange={(event) => onChange({ summary: event.target.value })}
        />
        <p className="app-muted text-xs">
          In the words it was reported in, as closely as you can. This is the
          record somebody will be asked about later.
        </p>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-severity`} required>
          Severity
        </FieldLabel>
        <Select
          value={state.severity}
          onValueChange={(value) => onChange({ severity: value ?? "moderate" })}
        >
          <SelectTrigger id={`${idPrefix}-severity`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDUCT_SEVERITIES.map((severity) => (
              <SelectItem key={severity.value} value={severity.value}>
                {severity.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}
