import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdultsOnlyBadge } from "@/components/adults-only-badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { isRenderableImageSrc, resolveImageUrl } from "@/lib/inventory";
import { formatDateTimeInZone } from "@/lib/time";
import { publicGiveawayRulesPath } from "@/lib/giveaway-rules-path";
import { getEventGiveawayRulesLink } from "@/lib/giveaway-rules-publication";
import {
  createSupabasePreviewClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { getPublicSite } from "@/lib/public-site";
import {
  loadEventPersonQuestions,
  loadMyPersonQuestions,
} from "@/lib/person-questions-public";
import {
  getPublicAsksAboutMinors,
  getPublicRequiresInstagram,
} from "@/lib/registration-settings";
import { loadEventWaiver } from "./event-waiver-data";
import { EventWaiver } from "./event-waiver";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { eventProgramsLabel, type PublicEvent } from "./event-card";
import { EventFlierFull } from "./event-flier";
import { EventGallery } from "./event-gallery";
import { loadPublicEventMedia } from "./event-media-data";
import { publicEventPhotosPath } from "./event-path";
import {
  PUBLIC_EVENT_PHOTO_PREVIEW,
  hasPublicEventMedia,
} from "@/lib/public-event-gallery";
import { EventRegistrationDisclosure } from "./event-registration-disclosure";
import { checkRegistrationWindow } from "./event-registration-form";
import { EventRegistrationForm } from "./event-registration-form-fields";
import { EventSponsors } from "./event-sponsors";
import { MyEventRegistrationForm } from "./my-registration-form";
import { RegistrationEmailStep } from "./registration-email-step";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signInCodeOffered } from "@/lib/notifications/sign-in-code";
import { eventCarpoolNotice } from "@/lib/event-carpools";
import {
  loadEventViewer,
  loadRegistrationAccountOffer,
  type EventViewer,
} from "./my-registration";
import type { AccountOffer } from "@/lib/constituent/account-offer";
import type { RegistrationOptionsQuestion } from "@/lib/registration-options";
import { loadRegistrationOptions } from "./registration-options-data";
import { loadRegistrationQuestions } from "./registration-questions-data";
import type {
  RegistrationAnswers,
  RegistrationQuestion,
} from "@/lib/registration-questions";
import { canCancelOwnRegistration } from "@/lib/registration-cancellation";
import { CantMakeItButton } from "@/app/(public)/my/cant-make-it-button";

// Not the shared DATE_TIME_WITH_ZONE: the detail page spells the date out in
// full where a card abbreviates it. The zone name is the part that matters and
// is the same either way (#1064).
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  // Components rather than `dateStyle`/`timeStyle`, which Intl refuses to
  // combine with `timeZoneName`. This is `dateStyle: "full"` plus the short
  // time and the zone the event is in.
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

/** The start (and end, when there is one) in the event's own zone. */
function formatWhen(event: PublicEvent): string {
  const starts = formatDateTimeInZone(
    event.starts_at,
    event.timezone,
    DATE_FORMAT_OPTIONS,
    "en-US",
  );
  if (!event.ends_at) return starts;
  return `${starts} – ${formatDateTimeInZone(event.ends_at, event.timezone, DATE_FORMAT_OPTIONS, "en-US")}`;
}

/**
 * Everything below the title: where and what it is, who is sponsoring it, and
 * how to register.
 */
function EventDetailBody({
  event,
  viewer,
  accountOffer,
  giveawayRulesId,
  waiver,
  waiverBlock,
  asksAboutMinors,
  requiresInstagram,
  minorAccompaniment,
  photoConsent,
  carpoolCostNotice,
  registrationOptions,
  registrationQuestions,
  profileQuestions,
  myProfileAnswers,
  offersSignInCode,
  preview,
}: {
  event: PublicEvent;
  viewer: EventViewer | null;
  accountOffer: AccountOffer | null;
  /** The promotion whose official rules this event serves, if any (#1322). */
  giveawayRulesId: string | null;
  /**
   * The version of the participant agreement being shown, which the form
   * posts back so the RPC can refuse a submission made against text that has
   * since been republished (#686). Null where the tenant takes no waiver.
   */
  waiver: { version: number; title: string } | null;
  /** That agreement, already rendered on the server. Null with `waiver`. */
  waiverBlock: React.ReactNode;
  /**
   * This organization's rule for a party that includes anyone under 18
   * (#685), shown once somebody answers yes. Empty on a tenant that has
   * written none, which is the state every tenant starts in.
   */
  asksAboutMinors: boolean;
  /** Whether a handle, or a contact in its place, is required (#1647). */
  requiresInstagram: boolean;
  minorAccompaniment: string[];
  /**
   * This organization's photos-and-video paragraphs (#599, #1376), shown as a
   * notice on the registration form. There is no box: registering carries the
   * agreement, and objecting happens afterwards. Empty on a tenant that has
   * written none, and empty means the form says nothing at all about photos --
   * exactly what it rendered before #599 shipped.
   */
  photoConsent: string[];
  /** The carpool cost-split notice (#1650), empty unless the event organizes carpools. */
  carpoolCostNotice: string[];
  /** The event's registration question (#1407), or null. */
  registrationOptions: RegistrationOptionsQuestion | null;
  /** The event's registration questions (#1501), empty for most events. */
  registrationQuestions: RegistrationQuestion[];
  /** The profile questions step 2 asks for this event (#1744), empty for most tenants. */
  profileQuestions: RegistrationQuestion[];
  /**
   * A linked reader's own answers to pre-fill them with; empty for everyone
   * else, since the anonymous form is never pre-filled (#1409 section 3).
   */
  myProfileAnswers: RegistrationAnswers;
  /** A staff preview (#1764): the form makes a test registration. */
  /**
   * Whether a visitor with no session starts with the email-first step
   * (#1765). False for a signed-in reader and a tenant with email off, which
   * have the form as it was. A staff preview shows it, sending nothing.
   */
  offersSignInCode: boolean;
  preview: boolean;
}) {
  const registrationWindow = checkRegistrationWindow(event);
  // Only a linked constituent can have one to find: `my_event_registration()`
  // looks the caller up through their `people` row, so an account without one
  // is never "already registered" as far as this page can tell.
  const existingRegistration =
    viewer?.kind === "linked" ? viewer.registration : null;

  const anonymousForm = (
    /* Signed in without an approved claim (#1162) still registers
           down the anonymous path, and still mints or matches a
           `people` row -- it just does not have to be told its own
           name and address to do it (#1257). */
    <EventRegistrationForm
      eventId={event.id}
      account={viewer?.kind === "account" ? viewer.account : null}
      accountOffer={accountOffer}
      waiver={waiver}
      waiverBlock={waiverBlock}
      asksAboutMinors={asksAboutMinors}
      requiresInstagram={requiresInstagram}
      adultsOnly={event.adults_only ?? false}
      minorAccompaniment={minorAccompaniment}
      photoConsent={photoConsent}
      carpoolCostNotice={carpoolCostNotice}
      registrationOptions={registrationOptions}
      registrationQuestions={registrationQuestions}
      profileQuestions={profileQuestions}
      preview={preview}
    />
  );

  return (
    <>
      {event.location && (
        <p className="app-muted text-sm sm:text-base">{event.location}</p>
      )}
      {event.description && (
        <p className="mt-6 max-w-2xl text-sm leading-relaxed whitespace-pre-line sm:text-base">
          {event.description}
        </p>
      )}

      <EventSponsors sponsors={event.sponsors} />

      {giveawayRulesId && (
        /* In the flow the rules govern, not only in a footer: somebody about
           to enter a promotion has to be able to read what they are entering
           before they do (#666, #1322). */
        <p className="mt-8 text-sm">
          <Link
            href={publicGiveawayRulesPath(giveawayRulesId)}
            className="underline underline-offset-4"
          >
            Official rules for the giveaway at this event
          </Link>
        </p>
      )}

      {event.registration_enabled && (
        /* No "Register" heading above this any more (#1256): the button is
           the heading's job now, and a heading over a status sentence
           ("you're registered", "the deadline has passed") only announced a
           form that is not there. */
        <section className="mt-10 max-w-2xl">
          {existingRegistration ? (
            /* Already signed up. Showing the state instead of a second form
               is the point of knowing who is reading: the database would
               refuse the duplicate anyway, and being told "you are already
               registered" after filling a form in is a worse way to learn
               it.

               #1418 gave a registration a cancelled state, so changing your
               mind is a button here until the event starts. A cancelled
               registration is not returned by `my_event_registration()`, so
               the form comes back for registering again. */
            <div className="space-y-2">
              <Alert>
                <div className="rainbow-accent mb-2 w-10" />
                <AlertDescription>
                  You&apos;re registered
                  {existingRegistration.party_size > 1
                    ? `, for ${existingRegistration.party_size} of you`
                    : ""}
                  .
                </AlertDescription>
              </Alert>
              {canCancelOwnRegistration(event.starts_at) && (
                <CantMakeItButton
                  registrationId={existingRegistration.registration_id}
                  eventId={event.id}
                  eventName={event.name}
                />
              )}
              <p className="app-muted text-sm">
                <Link href={MY_PATH_PREFIX} className="underline">
                  See this on your account
                </Link>
              </p>
            </div>
          ) : !registrationWindow.open ? (
            <p className="app-muted text-sm">{registrationWindow.reason}</p>
          ) : (
            <EventRegistrationDisclosure
              eventId={event.id}
              eventName={event.name}
            >
              {viewer?.kind === "linked" ? (
                <MyEventRegistrationForm
                  eventId={event.id}
                  person={viewer.person}
                  waiver={waiver}
                  waiverBlock={waiverBlock}
                  waiverOnFile={viewer.waiverOnFile}
                  asksAboutMinors={asksAboutMinors}
                  requiresInstagram={requiresInstagram}
                  adultsOnly={event.adults_only ?? false}
                  minorAccompaniment={minorAccompaniment}
                  photoConsent={photoConsent}
                  carpoolCostNotice={carpoolCostNotice}
                  registrationOptions={registrationOptions}
                  registrationQuestions={registrationQuestions}
                  profileQuestions={profileQuestions}
                  profileAnswers={myProfileAnswers}
                />
              ) : offersSignInCode ? (
                <RegistrationEmailStep eventId={event.id} preview={preview}>
                  {anonymousForm}
                </RegistrationEmailStep>
              ) : (
                anonymousForm
              )}
            </EventRegistrationDisclosure>
          )}
        </section>
      )}
    </>
  );
}

/**
 * One event, as `/events/e/[id]`'s own page inside a `PageShell`. A server
 * component: the client parts it reaches for (the registration form, sponsor
 * logos) draw their own boundaries.
 *
 * It used to render in a sheet over the listing as well (#847). #1427 dropped
 * the sheet: a flier beside the details and a carded, stepped form do not fit
 * in a 32rem panel, and keeping two presentations in step cost more than the
 * sheet gave back. A card on the listing now navigates here, and the
 * breadcrumb leads back.
 */
export async function EventDetailContent({
  event,
  preview = false,
}: {
  event: PublicEvent;
  /**
   * A staff preview (#1764). Reads go through the preview client, so the
   * event's own options and questions come back, and the reader is treated as
   * anonymous: a manager tests the form a visitor sees, never their own
   * "you're registered", and never registers themselves for real.
   */
  preview?: boolean;
}) {
  // Who is reading, for "you're registered" instead of a second form. Null for
  // everyone with no session at all, which is most visitors and costs them one
  // `getUser()`.
  const viewer = preview ? null : await loadEventViewer(event.id);
  // What the registration can offer afterwards (#1258).
  const accountOffer = await loadRegistrationAccountOffer(viewer);
  // Whether this event's promotion has published rules to point at.
  const supabase = preview
    ? await createSupabasePreviewClient(event.id)
    : await createSupabaseServerClient();
  const giveawayRules = await getEventGiveawayRulesLink(supabase, event.id);
  // The participant agreement, if this organization takes one (#686). Rendered
  // here on the server and handed down as an element, so a whole legal
  // document and the markup parser stay out of the client bundle -- and, for
  // the tenants that have adopted none, so does everything: `loadEventWaiver`
  // returns null off a read the footer already made.
  const waiver = await loadEventWaiver(supabase);
  // This organization's rule for a party that includes anyone under 18
  // (#685). Off the same `cache()`d `getPublicSite()` read the layout and the
  // footer already made, so it costs no query; empty on a tenant that has
  // written none, which leaves the form saying only what it asks for.
  const { content } = await getPublicSite(supabase);
  const minorAccompaniment = content.paragraphs("events.minor_accompaniment");
  // And this organization's photo and media consent scope (#599), off the same
  // read. Empty on a tenant that has written none, which is almost all of
  // them, and empty means the form asks nothing about photographs at all --
  // not an empty box, not a heading. Read here rather than in the client
  // component for the reason the waiver is: a block of tenant prose has no
  // business in the browser bundle of the tenants that have none.
  const photoConsent = content.paragraphs("events.photo_consent");
  // #1650. The cost-split notice, off the same read, and only on an event
  // that organizes carpools: everywhere else the form says nothing about them.
  // The event's own words, or none, when it has set them.
  const carpoolCostNotice = event.carpools_enabled
    ? eventCarpoolNotice(
        event.carpool_cost_notice,
        content.paragraphs("events.carpool_cost_notice"),
      )
    : [];
  // The event's own registration question (#1407). Only where registration
  // is on at all, so the events that take none pay no query for it.
  const registrationOptions = event.registration_enabled
    ? await loadRegistrationOptions(supabase, event.id)
    : null;
  // And its typed questions (#1501), under the same condition.
  const registrationQuestions = event.registration_enabled
    ? await loadRegistrationQuestions(supabase, event.id)
    : [];
  // The profile questions step 2 asks for this event (#1744), under the same
  // condition; a linked reader's own answers pre-fill them, nobody else's do.
  const profileQuestions = event.registration_enabled
    ? await loadEventPersonQuestions(supabase, event.id)
    : [];
  const myProfileAnswers =
    profileQuestions.length > 0 && viewer?.kind === "linked"
      ? (await loadMyPersonQuestions(supabase)).answers
      : {};
  // Whether registration asks about under-18s (#1416). Only where there is a
  // registration form, like the profile questions, and never on an 18+ event
  // (#1417), which asks for its confirmation instead.
  const asksAboutMinors =
    event.registration_enabled && !event.adults_only
      ? await getPublicAsksAboutMinors(supabase)
      : !event.adults_only;
  // #1647. Only where there is a registration form, like the setting above.
  const requiresInstagram = event.registration_enabled
    ? await getPublicRequiresInstagram(supabase)
    : false;
  // Email-first registration (#1765): only for a visitor with no session (a
  // staff preview has none), where there is a form to open, and on a tenant
  // whose email is on -- a code that can never arrive is not an offer. A
  // preview shows the step but sends nothing (RegistrationEmailStep).
  const offersSignInCode =
    viewer === null && event.registration_enabled
      ? await signInCodeOffered(supabase, createSupabaseAdminClient())
      : false;
  const waiverBlock = waiver ? (
    <EventWaiver
      doc={waiver.content}
      version={waiver.version}
      headingId="event-waiver-title"
    />
  ) : null;

  // Its public photos and videos (#1654), the newest photos only; the rest
  // are a link away. Read on every request, so a hidden photo is gone from
  // the next one.
  const media = await loadPublicEventMedia(event.id, {
    offset: 0,
    limit: PUBLIC_EVENT_PHOTO_PREVIEW,
  });
  const photosHref = publicEventPhotosPath(event.id);

  const flierUrl = resolveImageUrl(event.flier_url);
  const hasFlier = isRenderableImageSrc(flierUrl);

  return (
    <>
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/events" />}>
              Events
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{event.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Two columns from `lg` up, the flier on the right; one below it, with
          the flier first as it always was. The flier comes first in the DOM
          and `order` moves it, so a phone and a screen reader both meet it
          before the title, and a desktop reads the details on the left where
          the page's other headings start. Sticky, so a portrait flier stays
          beside a long description and the form as they scroll by. Without a
          flier there is no grid at all rather than an empty column. */}
      <div
        className={
          hasFlier
            ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12"
            : undefined
        }
      >
        {hasFlier && (
          <div className="mb-6 lg:sticky lg:top-8 lg:order-2 lg:mb-0 lg:self-start">
            <EventFlierFull
              flierUrl={event.flier_url}
              alt={event.name}
              sizes="(min-width: 1024px) 22rem, 100vw"
              // The flier is the page's largest paint.
              priority
            />
          </div>
        )}
        <div className="min-w-0 lg:order-1">
          <section>
            <p className="app-eyebrow">{eventProgramsLabel(event.programs)}</p>
            <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
              {event.name}
              <AdultsOnlyBadge
                adultsOnly={event.adults_only}
                className="ml-3 text-sm"
              />
            </h1>
            <p className="app-muted mt-4 text-sm sm:text-base">
              {formatWhen(event)}
            </p>
            {hasPublicEventMedia(media) && (
              <p className="mt-2 text-sm">
                <Link
                  href={photosHref}
                  className="underline underline-offset-4"
                >
                  {media.photoCount > 0
                    ? `Photos (${media.photoCount})`
                    : `Videos (${media.videos.length})`}
                </Link>
              </p>
            )}
          </section>
          <EventDetailBody
            event={event}
            viewer={viewer}
            accountOffer={accountOffer}
            giveawayRulesId={giveawayRules?.giveawayId ?? null}
            waiver={
              waiver
                ? { version: waiver.version, title: waiver.content.title }
                : null
            }
            waiverBlock={waiverBlock}
            asksAboutMinors={asksAboutMinors}
            requiresInstagram={requiresInstagram}
            minorAccompaniment={minorAccompaniment}
            photoConsent={photoConsent}
            carpoolCostNotice={carpoolCostNotice}
            registrationOptions={registrationOptions}
            registrationQuestions={registrationQuestions}
            profileQuestions={profileQuestions}
            myProfileAnswers={myProfileAnswers}
            offersSignInCode={offersSignInCode}
            preview={preview}
          />
          {hasPublicEventMedia(media) && (
            <div className="mt-12">
              <EventGallery
                eventName={event.name}
                media={media}
                allPhotosHref={photosHref}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
