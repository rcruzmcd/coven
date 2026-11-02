"use client";

import { FormEvent, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { FieldRow } from "@/components/field-row";
import { Input } from "@/components/ui/input";
import { PronounsField } from "@/components/pronouns-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  EXPERIENCE_LEVELS,
  RIDING_DISCIPLINES,
  experienceLevelLabel,
  ridesSki,
  ridesSnowboard,
  ridingDisciplineLabel,
} from "@/lib/rider-profile";
import type {
  ContactFieldErrors,
  ContactFieldName,
  MyContactDetails,
} from "@/lib/constituent/contact";
import {
  saveMyContactDetailsAction,
  saveMyPersonAnswersAction,
} from "./actions";
import { ProfileQuestionsFieldset } from "@/components/profile-questions-fieldset";
import {
  answersError,
  answersToDraft,
  draftToAnswers,
  type AnswerDraft,
  type RegistrationAnswers,
  type RegistrationQuestion,
} from "@/lib/registration-questions";

/** The id of each field an error can be pinned to, and its in-page anchor. */
const FIELD_IDS: Record<ContactFieldName, string> = {
  pronouns: "my-pronouns",
  instagramHandle: "my-instagramHandle",
  ridingDiscipline: "my-ridingDiscipline",
};

/** What the summary calls each field, matching its label on screen. */
const FIELD_LABELS: Record<ContactFieldName, string> = {
  pronouns: "Pronouns",
  instagramHandle: "Instagram",
  ridingDiscipline: "Rides",
};

/** Reading order, which is the order to list problems and to focus in. */
const FIELD_ORDER: ContactFieldName[] = [
  "pronouns",
  "instagramHandle",
  "ridingDiscipline",
];

function errorId(name: ContactFieldName): string {
  return `${FIELD_IDS[name]}-error`;
}

/** The legend is the group's heading outright, now that no card carries one. */
const LEGEND_CLASS =
  "brand-display mb-3 font-semibold data-[variant=legend]:text-lg";

/**
 * What separates one group from the next, in place of the card borders.
 *
 * A rule and some air, rather than a box: the three groups are parts of one
 * record and one save, and three boxes said they were three things.
 *
 * On a wrapper rather than on the `<fieldset>` itself, which is where it was
 * first put and looked wrong on screen. A `<legend>` renders *in* its
 * fieldset's top border and interrupts it, so the rule came out as a line
 * starting at the heading's right edge and running to the margin -- a
 * decoration nobody chose, and only on the two groups that had one.
 */
const GROUP_CLASS = "border-t border-[var(--line)] pt-8";

/**
 * `min-w-0` is not tidiness: a `fieldset` takes its automatic minimum width
 * from its contents rather than the usual `auto`, so without this the grid
 * rows inside can push the group wider than the column holding it.
 */
const FIELDSET_CLASS = "min-w-0";

type ContactFormValues = {
  preferredName: string;
  phone: string;
  pronouns: string;
  instagramHandle: string;
  preferredMountain: string;
  ridingDiscipline: string;
  skiExperienceLevel: string;
  snowboardExperienceLevel: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string;
};

function valuesOf(details: MyContactDetails): ContactFormValues {
  return {
    preferredName: details.preferred_name ?? "",
    phone: details.phone ?? "",
    pronouns: details.pronouns ?? "",
    instagramHandle: details.instagram_handle ?? "",
    preferredMountain: details.preferred_mountain ?? "",
    ridingDiscipline: details.riding_discipline ?? "",
    skiExperienceLevel: details.ski_experience_level ?? "",
    snowboardExperienceLevel: details.snowboard_experience_level ?? "",
    addressLine1: details.address_line1 ?? "",
    addressLine2: details.address_line2 ?? "",
    addressCity: details.address_city ?? "",
    addressRegion: details.address_region ?? "",
    addressPostalCode: details.address_postal_code ?? "",
    addressCountry: details.address_country ?? "",
  };
}

/**
 * The allowlist, as a form (#1164), in the shape the record itself has (#1181).
 *
 * Fully controlled rather than read off the DOM at submit: three of these
 * fields are Selects, and two of them appear and disappear with the answer to
 * a third, so a `new FormData(form)` would carry whichever ones happened to be
 * mounted. Building the payload from state keeps what is sent equal to what
 * the person sees.
 *
 * Every field is optional and nothing here is required, which is deliberate.
 * A person arriving to fix a phone number must not be held up by a postal
 * address the organization has never needed.
 *
 * Email is not on this form. It moves through EmailChangeForm, because it
 * moves only once a link sent to the new address comes back.
 *
 * Three groups, three sections, one form. Fourteen fields under a card called
 * "Everything else" was the complaint (#1181), and the grouping that answers
 * it already existed one level down as these three legends -- so each legend
 * is the visible heading and a rule divides them. They were cards for a while
 * in between, which said the opposite of what is true: one `<form>` and one
 * save across all three, because `set_my_contact_details()` writes the whole
 * allowlist in one call and a per-group payload would blank the columns it did
 * not send. The page reserves the card for the email block, which really does
 * commit on its own.
 *
 * The pairs are `FieldRow`, not `<Field orientation="responsive">`. Why is in
 * `src/components/field-row.tsx`; the short version is that the variant is
 * shadcn's label-beside-control layout, and used as a two-column grid it
 * centred each pair against itself and sized each column to its contents.
 *
 * The rider group renders only for a tenant with the rider_profile module
 * (#1408). The values still travel with the form, as they were loaded, and
 * `set_my_contact_details()` ignores them without the module -- so hiding the
 * group can never blank what a person told the organization before.
 */
export function ContactForm({
  details,
  showRider = true,
  profileQuestions = [],
  profileAnswers = {},
}: {
  details: MyContactDetails;
  showRider?: boolean;
  /**
   * The organization's profile questions asked here (#1744), and the
   * reader's own current answers. Empty for a tenant asking none, which
   * leaves the form as it was.
   */
  profileQuestions?: readonly RegistrationQuestion[];
  profileAnswers?: RegistrationAnswers;
}) {
  const [form, setForm] = useState<ContactFormValues>(() => valuesOf(details));
  // #1744. Saved by their own action after the contact fields, and only when
  // they changed: an answer left blank here is a cleared one.
  const [profileDraft, setProfileDraft] = useState<AnswerDraft>(() =>
    answersToDraft(profileQuestions, profileAnswers),
  );
  const [profileBaseline, setProfileBaseline] = useState(() =>
    JSON.stringify(
      draftToAnswers(
        profileQuestions,
        answersToDraft(profileQuestions, profileAnswers),
      ),
    ),
  );
  const nextProfileAnswers = draftToAnswers(profileQuestions, profileDraft);
  const profileDirty = JSON.stringify(nextProfileAnswers) !== profileBaseline;
  // What the form last agreed with the record: the values it loaded, and then
  // the values it sent successfully. Save is gated on differing from this, so
  // a button at the foot of a long page is never a live control somebody
  // scrolled to for nothing -- the same gate, for the same reason, as
  // portal/account's AccountForm.
  const [baseline, setBaseline] = useState<ContactFormValues>(() =>
    valuesOf(details),
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const contactDirty = useMemo(
    () =>
      (Object.keys(baseline) as (keyof ContactFormValues)[]).some(
        (key) => form[key] !== baseline[key],
      ),
    [form, baseline],
  );
  const isDirty = contactDirty || profileDirty;

  const invalidFields = useMemo(
    () => FIELD_ORDER.filter((name) => fieldErrors[name]),
    [fieldErrors],
  );

  function update(key: keyof ContactFormValues, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
    // A field stops being marked the moment it is edited. Leaving the mark up
    // while somebody types the correction says the correction is wrong too.
    if (key in FIELD_IDS) {
      setFieldErrors((current) => {
        const name = key as ContactFieldName;
        if (!current[name]) return current;
        const next = { ...current };
        delete next[name];
        return next;
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const profileProblem = profileDirty
      ? answersError(profileQuestions, nextProfileAnswers)
      : null;
    if (profileProblem) {
      setError(profileProblem.message);
      return;
    }

    setIsSaving(true);

    const payload = new FormData();
    for (const [key, value] of Object.entries(form)) payload.set(key, value);

    const result = contactDirty
      ? await saveMyContactDetailsAction(payload)
      : ({ saved: true } as const);
    if (!("error" in result)) setBaseline(form);
    const profileResult =
      !("error" in result) && profileDirty
        ? await saveMyPersonAnswersAction(nextProfileAnswers)
        : null;
    setIsSaving(false);

    if (profileResult && "error" in profileResult) {
      setError(profileResult.error);
      return;
    }
    if (profileResult) {
      setProfileBaseline(JSON.stringify(nextProfileAnswers));
    }

    if ("error" in result) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      // Take somebody who pressed Save at the foot of the page to the problem,
      // rather than telling them one exists somewhere above. getElementById
      // rather than a ref because one of the three is a Select whose trigger
      // this component does not hold; the id is the handle all three share.
      const firstInvalid = FIELD_ORDER.find(
        (name) => result.fieldErrors?.[name],
      );
      if (firstInvalid) {
        document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      }
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      <FieldSet className={FIELDSET_CLASS}>
        <FieldLegend className={LEGEND_CLASS}>How to reach you</FieldLegend>
        <FieldGroup>
          <FieldRow>
            <Field>
              <FieldLabel htmlFor="my-preferredName">
                The name you go by
              </FieldLabel>
              <Input
                id="my-preferredName"
                value={form.preferredName}
                onChange={(event) =>
                  update("preferredName", event.target.value)
                }
              />
              <FieldDescription>
                What we call you. We keep{" "}
                {details.name ? `“${details.name}”` : "your full name"} on the
                record itself — tell us if that needs correcting.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="my-phone">Phone</FieldLabel>
              <Input
                id="my-phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(event) => update("phone", event.target.value)}
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <PronounsField
              id="my-pronouns"
              value={form.pronouns}
              onChange={(value) => update("pronouns", value)}
              error={fieldErrors.pronouns}
              errorId={errorId("pronouns")}
            />
            <Field>
              <FieldLabel htmlFor="my-instagramHandle">Instagram</FieldLabel>
              <Input
                id="my-instagramHandle"
                // normalize_instagram_handle() strips a leading @, so the
                // placeholder says so rather than asking for a form the
                // code does not care about (#1182).
                placeholder="handle, with or without the @"
                value={form.instagramHandle}
                aria-invalid={fieldErrors.instagramHandle ? true : undefined}
                aria-describedby={
                  fieldErrors.instagramHandle
                    ? errorId("instagramHandle")
                    : undefined
                }
                onChange={(event) =>
                  update("instagramHandle", event.target.value)
                }
              />
              {fieldErrors.instagramHandle && (
                <FieldError id={errorId("instagramHandle")}>
                  {fieldErrors.instagramHandle}
                </FieldError>
              )}
            </Field>
          </FieldRow>
        </FieldGroup>
      </FieldSet>

      <div className={GROUP_CLASS}>
        <FieldSet className={FIELDSET_CLASS}>
          <FieldLegend className={LEGEND_CLASS}>
            Where to send things
          </FieldLegend>
          <FieldGroup>
            {/* Two Fields, not one Field holding two inputs: the second line
                  carried only an aria-label, so a sighted person got an
                  unexplained box and anyone using speech got a label that
                  never appears on screen (#1181). */}
            <Field>
              <FieldLabel htmlFor="my-addressLine1">Street address</FieldLabel>
              <Input
                id="my-addressLine1"
                autoComplete="address-line1"
                value={form.addressLine1}
                onChange={(event) => update("addressLine1", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="my-addressLine2">
                Apartment, suite, etc.
              </FieldLabel>
              <Input
                id="my-addressLine2"
                autoComplete="address-line2"
                value={form.addressLine2}
                onChange={(event) => update("addressLine2", event.target.value)}
              />
            </Field>
            <FieldRow>
              <Field>
                <FieldLabel htmlFor="my-addressCity">City</FieldLabel>
                <Input
                  id="my-addressCity"
                  autoComplete="address-level2"
                  value={form.addressCity}
                  onChange={(event) =>
                    update("addressCity", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="my-addressRegion">
                  State or region
                </FieldLabel>
                <Input
                  id="my-addressRegion"
                  autoComplete="address-level1"
                  value={form.addressRegion}
                  onChange={(event) =>
                    update("addressRegion", event.target.value)
                  }
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field>
                <FieldLabel htmlFor="my-addressPostalCode">
                  Postal code
                </FieldLabel>
                <Input
                  id="my-addressPostalCode"
                  autoComplete="postal-code"
                  value={form.addressPostalCode}
                  onChange={(event) =>
                    update("addressPostalCode", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="my-addressCountry">Country</FieldLabel>
                <Input
                  id="my-addressCountry"
                  autoComplete="country-name"
                  value={form.addressCountry}
                  onChange={(event) =>
                    update("addressCountry", event.target.value)
                  }
                />
              </Field>
            </FieldRow>
          </FieldGroup>
        </FieldSet>
      </div>

      {showRider && (
        <div className={GROUP_CLASS}>
          <FieldSet className={FIELDSET_CLASS}>
            <FieldLegend className={LEGEND_CLASS}>What you ride</FieldLegend>
            <FieldGroup>
              <FieldRow>
                <Field>
                  <FieldLabel htmlFor="my-ridingDiscipline">Rides</FieldLabel>
                  <Select
                    value={form.ridingDiscipline}
                    onValueChange={(value) =>
                      update("ridingDiscipline", String(value ?? ""))
                    }
                  >
                    <SelectTrigger
                      id="my-ridingDiscipline"
                      className="w-full"
                      aria-invalid={
                        fieldErrors.ridingDiscipline ? true : undefined
                      }
                      aria-describedby={
                        fieldErrors.ridingDiscipline
                          ? errorId("ridingDiscipline")
                          : undefined
                      }
                    >
                      <SelectValue placeholder="Not recorded">
                        {(value: string) => ridingDisciplineLabel(value)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {RIDING_DISCIPLINES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.ridingDiscipline && (
                    <FieldError id={errorId("ridingDiscipline")}>
                      {fieldErrors.ridingDiscipline}
                    </FieldError>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="my-preferredMountain">
                    Home mountain
                  </FieldLabel>
                  <Input
                    id="my-preferredMountain"
                    value={form.preferredMountain}
                    onChange={(event) =>
                      update("preferredMountain", event.target.value)
                    }
                  />
                </Field>
              </FieldRow>

              {(ridesSki(form.ridingDiscipline) ||
                ridesSnowboard(form.ridingDiscipline)) && (
                <FieldRow>
                  {ridesSki(form.ridingDiscipline) && (
                    <Field>
                      <FieldLabel htmlFor="my-skiExperienceLevel">
                        Ski experience
                      </FieldLabel>
                      <Select
                        value={form.skiExperienceLevel}
                        onValueChange={(value) =>
                          update("skiExperienceLevel", String(value ?? ""))
                        }
                      >
                        <SelectTrigger
                          id="my-skiExperienceLevel"
                          className="w-full"
                        >
                          <SelectValue placeholder="Not recorded">
                            {(value: string) => experienceLevelLabel(value)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {EXPERIENCE_LEVELS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  {ridesSnowboard(form.ridingDiscipline) && (
                    <Field>
                      <FieldLabel htmlFor="my-snowboardExperienceLevel">
                        Snowboard experience
                      </FieldLabel>
                      <Select
                        value={form.snowboardExperienceLevel}
                        onValueChange={(value) =>
                          update(
                            "snowboardExperienceLevel",
                            String(value ?? ""),
                          )
                        }
                      >
                        <SelectTrigger
                          id="my-snowboardExperienceLevel"
                          className="w-full"
                        >
                          <SelectValue placeholder="Not recorded">
                            {(value: string) => experienceLevelLabel(value)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {EXPERIENCE_LEVELS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </FieldRow>
              )}
            </FieldGroup>
          </FieldSet>
        </div>
      )}

      {profileQuestions.length > 0 && (
        <div className={GROUP_CLASS}>
          <ProfileQuestionsFieldset
            idPrefix="my"
            questions={profileQuestions}
            draft={profileDraft}
            onChange={(next) => {
              setProfileDraft(next);
              setSaved(false);
            }}
            disabled={isSaving}
            className={FIELDSET_CLASS}
            legendClassName={LEGEND_CLASS}
          />
        </div>
      )}

      {(error || saved) && (
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                {/* The fields are hundreds of pixels above this alert on a page
                  this long, so the summary carries a way back to each one. A
                  plain fragment link is enough: every target is an input or a
                  button, and the browser moves focus to a focusable target. */}
                {invalidFields.length > 0 && (
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
                    {invalidFields.map((name) => (
                      <li key={name}>
                        <a href={`#${FIELD_IDS[name]}`}>{FIELD_LABELS[name]}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* The public forms replace themselves with this alert on success.
              This one must not: it is an edit form, and the record it edits
              has to stay on screen for the next correction. The accent and the
              wording follow the convention; only the replacing does not. */}
          {saved && (
            <Alert role="status">
              <div className="rainbow-accent mb-2 w-10" />
              <AlertDescription>
                Saved. Your details are up to date.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Sticky, but only once there is something to save.
          Fourteen fields is more than a viewport, so the button that commits
          them was reliably off-screen from the moment somebody started typing
          -- which is what the second copy of the nav at the foot of this page
          was really compensating for. It sticks rather than being fixed so
          that it settles into the page at the end of the form instead of
          sitting over the email card below it, and it takes its border and
          backdrop only while floating, because a resting button in the flow of
          the page needs neither. Clean, it stays where it was: an inert
          control that follows you down a page is noise.

          A direct child of the `<form>` on purpose. A sticky element can only
          travel inside its own parent's box, so wrapped in the short div that
          holds the alerts it had nowhere to go and never left the foot of the
          page -- which looks exactly like sticky positioning not working at
          all, and was how this shipped for about ten minutes. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2",
          isDirty &&
            "sticky bottom-4 z-10 rounded-xl border border-[var(--line)] bg-background/90 p-3 shadow-lg backdrop-blur-sm",
        )}
      >
        <Button
          type="submit"
          disabled={isSaving || !isDirty}
          className="w-full sm:w-fit"
        >
          {isSaving ? (
            <>
              <Spinner /> Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
        {isDirty && !isSaving && (
          <p className="app-muted text-sm">Your changes are not saved yet.</p>
        )}
      </div>
    </form>
  );
}
