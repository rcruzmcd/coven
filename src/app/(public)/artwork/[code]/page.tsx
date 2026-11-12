import { MarkdownText } from "@/components/portal/markdown-text";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import { getPageVisibility, hiddenSlots } from "@/lib/page-visibility";
import { isHrefVisible } from "@/lib/public-nav";
import { formatDateTimeInZone } from "@/lib/time";
import { ArtworkSubmissionForm } from "./artwork-submission-form";
import { CallBrief } from "./call-brief";

type ArtworkCall = {
  call_id: string;
  /** #1454. Anything but `open` arrives with the event fields, intro and
   * rights note already nulled by the RPC, so a closed call's brief never
   * reaches the page at all. */
  status: "open" | "not_yet_open" | "closed";
  title: string;
  /** Null on a call that stands on its own (#879); the four fields below it
   * are null with it, and the page renders the call's own deadline instead of
   * an event line. */
  event_id: string | null;
  event_name: string | null;
  starts_at: string | null;
  /** The call's own zone, else the event's, else UTC -- resolved in the RPC so
   * this is never null and never has to be guessed at here. */
  display_timezone: string;
  location: string | null;
  intro: string | null;
  rights_note: string | null;
  opens_at: string | null;
  closes_at: string | null;
  max_images: number;
};

/**
 * The closed and not-yet-open dates. Spelled out component by component for
 * the same reason as the brief's deadline: Intl refuses `timeZoneName`
 * alongside `dateStyle`, and a cutoff without its zone is a day's ambiguity.
 */
const WINDOW_FORMAT: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

// Link-only, so it must never be indexed or surfaced from search: the code is
// the whole access control, and a crawled page hands it to everyone.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ArtworkSubmissionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createSupabaseServerClient();
  const ipAddress = await getClientIp();

  const { data, error } = await supabase
    .rpc("get_artwork_call", { p_code: code, p_ip_address: ipAddress })
    .maybeSingle();

  // An unknown code, another tenant's, a never-published draft, an off artwork
  // module and a tripped rate limit all 404. A closed or not-yet-open call does
  // not (#1454): whoever holds its code got it from a flyer or a link, and
  // "page not found" tells them the link is broken when it is only late.
  if (error || !data) notFound();
  const call = data as ArtworkCall;

  if (call.status !== "open") {
    return <UnavailableCall call={call} />;
  }

  // In the event's own zone, not the rendering environment's. This runs in a
  // Server Component, so the toLocaleDateString() it replaces was resolving
  // against whatever zone the serverless region happened to be in.
  const eventLine = call.starts_at
    ? formatDateTimeInZone(
        call.starts_at,
        call.display_timezone,
        { dateStyle: "long" },
        "en-US",
      ) + (call.location ? ` · ${call.location}` : "")
    : null;

  return (
    <PageShell>
      <p className="app-eyebrow">Call for artwork</p>
      {/*
          The call's own title, not the event's name (#879). Someone arriving
          from a flyer used to read this page as an event page, with the thing
          it was actually asking of them in quiet eyebrow text above.
        */}
      <h1 className="brand-display mt-2 text-3xl sm:text-4xl">{call.title}</h1>
      <div className="rainbow-accent mt-4 w-16" />
      {/* Absent entirely on a standalone call: the brief below carries the
            deadline, which is the date that matters to a submitter anyway. */}
      {eventLine && <p className="app-muted mt-4">{eventLine}</p>}

      {call.intro && (
        <MarkdownText className="mt-6 text-base leading-relaxed">
          {call.intro}
        </MarkdownText>
      )}

      <div className="mt-8">
        <CallBrief
          closesAt={call.closes_at}
          timeZone={call.display_timezone}
          maxImages={call.max_images}
          rightsNote={call.rights_note}
        />
      </div>

      <div className="mt-10">
        <ArtworkSubmissionForm
          code={code}
          maxImages={call.max_images}
          rightsNote={call.rights_note}
        />
      </div>
    </PageShell>
  );
}

/**
 * A call someone holds the link to but cannot submit to yet, or any more. The
 * title and the date only -- no brief, no form -- and a 200 rather than a 410:
 * the page is noindex, so a status only a crawler would read buys nothing.
 */
async function UnavailableCall({ call }: { call: ArtworkCall }) {
  const supabase = await createSupabaseServerClient();
  const hidden = hiddenSlots(await getPageVisibility(supabase));

  // The call's own zone, as the issue that asked for this page specified: the
  // date is a fact about the call, and it is the same fact for every reader.
  const format = (iso: string) =>
    formatDateTimeInZone(iso, call.display_timezone, WINDOW_FORMAT, "en-US");

  let message: string;
  if (call.status === "not_yet_open") {
    message = call.opens_at
      ? `Submissions open on ${format(call.opens_at)}.`
      : "Submissions are not open yet.";
  } else {
    // A call switched off before its deadline has no closing date worth
    // quoting -- the one it carries has not happened.
    const closedAt =
      call.closes_at && new Date(call.closes_at) <= new Date()
        ? call.closes_at
        : null;
    message = closedAt
      ? `Submissions for this call closed on ${format(closedAt)}.`
      : "Submissions for this call are closed.";
  }

  return (
    <PageShell>
      <p className="app-eyebrow">Call for artwork</p>
      <h1 className="brand-display mt-2 text-3xl sm:text-4xl">{call.title}</h1>
      <div className="rainbow-accent mt-4 w-16" />
      <p className="mt-6 text-base leading-relaxed">{message}</p>
      {isHrefVisible(hidden, "/contact") && (
        <p className="app-muted mt-4">
          Questions about this call?{" "}
          <Link href="/contact" className="underline underline-offset-4">
            Get in touch
          </Link>
          .
        </p>
      )}
    </PageShell>
  );
}
