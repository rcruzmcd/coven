import Link from "next/link";
import { PublicSiteLink } from "@/components/portal/public-site-link";
import { HowToSection } from "@/components/how-to-section";
import type { HelpEntry } from "./help-context";

/*
 * Authoring guidelines (grounded in NN/g research on contextual help):
 *
 * - Task-first, not concept-first. Lead with what you do on this page as
 *   short numbered steps, written to be followed while the sheet is open
 *   beside the page. Concepts come after, in their own section.
 * - Skip the obvious. Don't document standard UI ("click Save"). Reserve
 *   entries for what's genuinely non-standard: approval chains,
 *   permission-dependent visibility, status lifecycles, import formats.
 *   If a page needs no explanation, let it fall back to its module or the
 *   root entry rather than padding — low-value help teaches users to stop
 *   opening the sheet.
 * - Progressive disclosure. One-line description, 2–4 short sections, and
 *   a link out for anything long.
 * - Explain the why on rules. Reasons make rules memorable; bare rules
 *   don't stick.
 *
 * Keys are route prefixes resolved by longest match (see help-matcher.ts):
 * a page entry shadows its module entry, which shadows "/portal". Content
 * whose text depends on data fetched by the page (e.g. a live approval
 * threshold) is registered from the page via <PageHelpContent> instead.
 */
export const helpContent: Record<string, HelpEntry> = {
  "/portal": {
    title: "Portal basics",
    description: "How navigation, access, and this help panel work.",
    body: (
      <>
        <HowToSection heading="Finding your way">
          <p>
            The sidebar lists only the modules your roles can access, and quick
            actions at the top cover the most common tasks. The bell in the
            header collects items needing someone&apos;s attention — approvals,
            inbox items, and reminders relevant to you.
          </p>
        </HowToSection>
        <HowToSection heading="Why you might not see a page">
          <p>
            Access is driven by the role permissions matrix, checked on every
            request — if a page you expect is missing, an admin can grant your
            role access under Administration, and it appears immediately without
            a re-login.
          </p>
          <p>
            Administrators: the{" "}
            <Link
              href="/portal/administration/permission-reference"
              className="font-medium underline underline-offset-2"
            >
              permission reference
            </Link>{" "}
            says what each permission grants at View and at Manage, and which
            neighbouring permission covers what it doesn&apos;t — the answer to
            &ldquo;which grant fixes this?&rdquo;.
          </p>
        </HowToSection>
        <HowToSection heading="About this panel">
          <p>
            This icon shows guidance for whichever page you&apos;re on. Pages
            without their own guide yet fall back to this overview.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/home": {
    title: "Reading the dashboard",
    description: "What the figures cover, and where each one leads.",
    body: (
      <>
        <HowToSection heading="What you see depends on your roles">
          <p>
            Each card is gated on its own permission, and individual figures
            inside a card are gated more narrowly still — a board member with
            read-only finance sees the Financial card without the event-expense
            rows. A card you can&apos;t see is an access question, not an empty
            one.
          </p>
        </HowToSection>
        <HowToSection heading="Every figure opens">
          <p>
            Clicking a row takes you to the records behind it. Where a figure
            spans two statuses — outstanding reimbursements is submitted{" "}
            <em>and</em> approved-but-unpaid, inventory needing attention is
            damaged <em>and</em> lost — the link goes to the unfiltered list on
            purpose, since any single filter would show a total that didn&apos;t
            match the number you clicked.
          </p>
        </HowToSection>
        <HowToSection heading="&ldquo;FY&rdquo; means the fiscal year, not the calendar year">
          <p>
            The financial figures are captioned with a fiscal year — FY2027, say
            — because an organization&apos;s year need not start in January. A
            fiscal year is named for the calendar year it ends in, so under a
            July start FY2027 runs July 1 2026 to June 30 2027. A start month
            chosen that way keeps a whole winter season inside one year instead
            of splitting it across two. An admin or board member sets the start
            month in{" "}
            <Link
              href="/portal/administration/organization-settings"
              className="underline hover:text-foreground"
            >
              Organization Settings
            </Link>
            .
          </p>
        </HowToSection>
        <HowToSection heading="Happening now">
          <p>
            Events currently running appear at the top with their in-context
            actions, so checking someone in doesn&apos;t start with finding the
            event.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/governance": {
    title: "How the governance record works",
    description:
      "What each record set is for, and why the board keeps it current.",
    body: (
      <>
        <HowToSection heading="What lives here">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Board members</strong> and{" "}
              <strong className="text-foreground">Meetings</strong> — who
              serves, their terms, and what was decided. Attendance is what
              establishes quorum for a meeting&apos;s decisions, so removing an
              attendee changes what those decisions rest on.
            </li>
            <li>
              <strong className="text-foreground">Bylaws</strong>,{" "}
              <strong className="text-foreground">Policies</strong> and{" "}
              <strong className="text-foreground">Resolutions</strong> — the
              rules and the formal decisions that changed them. Bylaws are
              versioned rather than edited in place, so the history of what was
              in force when stays intact.
            </li>
            <li>
              <strong className="text-foreground">Conflict of Interest</strong>{" "}
              and{" "}
              <strong className="text-foreground">Annual Requirements</strong> —
              the compliance calendar. A missing disclosure or an overdue
              requirement surfaces on the dashboard and in the bell.
            </li>
            <li>
              <strong className="text-foreground">Nonprofit Status</strong>,{" "}
              <strong className="text-foreground">Grants</strong> and{" "}
              <strong className="text-foreground">Partnerships</strong> — work
              in flight toward funding and recognition, each with its own stage
              or milestone track.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Why it's kept in the portal">
          <p>
            Grant applications and state filings ask for this record, and
            reconstructing it after the fact is where nonprofits lose time. The
            board keeping it current as it goes is the whole point — nothing
            here is generated from anywhere else.
          </p>
        </HowToSection>
        <HowToSection heading="Who can change it">
          <p>
            Governance records need{" "}
            <strong className="text-foreground">governance</strong> at manage
            level, which the board and admin roles hold. Read-only governance
            access shows the record without the edit controls.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/inventory/categories": {
    title: "How item categories work",
    description:
      "The two-level vocabulary staff tag donated gear with, and why names matter.",
    body: (
      <>
        <HowToSection heading="Two levels">
          <p>
            A <strong className="text-foreground">group</strong> (Outerwear)
            holds <strong className="text-foreground">categories</strong>{" "}
            (Jacket, Pants). Items are always tagged with a category, never a
            group; groups exist so pickers stay readable and so reports can roll
            up. There is no third level.
          </p>
        </HowToSection>
        <HowToSection heading="Retire, don't delete">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              Deleting only works while no item uses the category. Anything
              already tagged with it blocks the delete on purpose, so history
              can&apos;t lose its classification.
            </li>
            <li>
              Turning <strong className="text-foreground">Active</strong> off is
              the usual move: the category stays on the items that carry it and
              disappears from the pickers.
            </li>
            <li>
              Renaming a category is safe — the underlying key never changes, so
              saved filter links and existing items keep working.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Names feed the giveaway tiers">
          <p>
            A giveaway&apos;s tier hints match on the item&apos;s group and
            category names, so a name that happens to contain a keyword will
            suggest the wrong ticket colour — &ldquo;Snowboard boots&rdquo;
            would match the <em>snowboard</em> hint and suggest gold for a pair
            of boots. That is why footwear is a single &ldquo;Boots&rdquo;
            category and the boards group is called &ldquo;Hardgoods&rdquo;.
            Staff can always override a suggested tier at intake.
          </p>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Anyone signed in can see the list, because donation intake has to
            show it. Adding, renaming and retiring categories needs manage
            access to inventory.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/inventory": {
    title: "How gear moves through inventory",
    description: "Item statuses, and what a distribution actually records.",
    body: (
      <>
        <HowToSection heading="The lifecycle">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              A donation brings items in. Each physical item becomes its own
              row, because gear is tracked and given out one piece at a time.
            </li>
            <li>
              Items sit <strong className="text-foreground">available</strong>{" "}
              until they&apos;re reserved for someone or distributed.
            </li>
            <li>
              A distribution records who received what and when, which is what
              impact reporting counts. It isn&apos;t a stock adjustment — the
              recipient is part of the record.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Damaged, lost and retired">
          <p>
            These are statuses, not deletions, so a written-off item stays in
            the history and in the totals it was part of. The dashboard&apos;s
            &ldquo;needing attention&rdquo; figure counts damaged and lost
            together.
          </p>
        </HowToSection>
        <HowToSection heading="Who can do what">
          <p>
            <strong className="text-foreground">inventory_intake</strong> covers
            recording donations and distributions — the work that happens at an
            event or in the van. Editing the catalogue itself needs{" "}
            <strong className="text-foreground">inventory</strong> at manage
            level.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/volunteers": {
    title: "How volunteering is tracked",
    description: "Roles, applications, and the hours that feed reporting.",
    body: (
      <>
        <HowToSection heading="Three separate things">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Roles</strong> are the kinds
              of work someone can sign up for. Marking one public lists it on
              the website&apos;s volunteer page; the rest stay internal.
            </li>
            <li>
              <strong className="text-foreground">Applications</strong> come
              from the public form and move through their own status track until
              someone is placed or the application is closed.
            </li>
            <li>
              <strong className="text-foreground">Participation</strong> is
              logged hours: who did what, on which event, for how long.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Why hours matter more than they look">
          <p>
            Volunteer hours are reported to grantmakers and count toward in-kind
            contribution totals, so an entry deleted here changes a number the
            organization has already reported. That&apos;s why removing one asks
            first.
          </p>
        </HowToSection>
        <HowToSection heading="Logging for someone else">
          <p>
            <strong className="text-foreground">volunteer_hours_logging</strong>{" "}
            lets a coordinator log their own hours; logging on behalf of another
            person needs <strong className="text-foreground">volunteers</strong>{" "}
            at manage level.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/programs": {
    title: "What a program is",
    description: "The unit impact is reported against.",
    body: (
      <>
        <HowToSection heading="Programs group the work">
          <p>
            A program is an ongoing strand of activity — a season of trips, a
            gear library, a mentorship track. Events and calendar items are
            attached to one, and the Impact Report totals up from that
            attachment. An event with no program still runs; it just
            doesn&apos;t roll up anywhere.
          </p>
        </HowToSection>
        <HowToSection heading="Status is about reporting, not visibility">
          <p>
            Marking a program complete stops it collecting new work; it
            doesn&apos;t hide what it already holds, and past events keep
            counting toward its totals.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/account": {
    title: "Your account",
    description: "What you can change here, and what an admin has to.",
    body: (
      <>
        <HowToSection heading="Preferred name">
          <p>
            Set it and the whole portal uses it — sidebar, record owners,
            attendance lists — in place of the name on your sign-in account.
            It&apos;s the only place your own display name comes from, so
            it&apos;s worth setting if your account name isn&apos;t what
            colleagues call you.
          </p>
        </HowToSection>
        <HowToSection heading="What an admin controls">
          <p>
            Roles and portal access aren&apos;t editable here. If a section you
            expect is missing, an admin grants your role access under
            Administration and it appears immediately, without a re-login.
          </p>
        </HowToSection>
        <HowToSection heading="Password and the tour">
          <p>
            Password changes go through the reset link on the sign-in page. The
            portal introduction can be replayed from here any time.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/calendar": {
    title: "How calendar items work",
    description: "Priority tiers, sensitive topics, and social content.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Priority tier</strong> — Tier
              1 items need an explicit Plan, Skip, or Defer decision before
              their date passes (once it&apos;s Tier 1, undecided, and not
              archived, the item is flagged as needing one). Tiers 2 and 3
              don&apos;t require a decision.
            </li>
            <li>
              <strong className="text-foreground">Sensitive topic</strong> —
              flagging an item this way surfaces its tone guidance on the
              item&apos;s Social content card, so whoever writes the content
              sees it.
            </li>
            <li>
              <strong className="text-foreground">Social content</strong> — one
              item usually produces several posts or stories. Each social post
              is added on the item&apos;s Social content card and moves through
              its own draft/review/publish stages. A post can also be related to
              an event, and planned from that event&apos;s own Social content
              section, or to nothing, and its publish date is optional; once it
              has one, its draft and review dates can be set from its lead time.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Anyone with manage access to the content calendar can create or edit
            items and record decisions; everyone else can view.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              An undecided Tier 1 item stays flagged on this list until a
              decision is recorded.
            </li>
            <li>
              Every create, edit, or delete on a calendar item is written to the
              audit log.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Deciding Skip or Defer on a Tier 1 item after its date has already
              passed doesn&apos;t retroactively clear it from history — decide
              before the date when possible.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/calendar/import": {
    title: "How calendar import works",
    description: "Generating recurring observances and bulk CSV import.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Generate missing instances
              </strong>{" "}
              — for each recurring Tier 1/2 observance missing a date in the
              target year, generate just that one series, or use Generate all to
              fill in every missing one at once.
            </li>
            <li>
              <strong className="text-foreground">Bulk import</strong> — the CSV
              importer adds new one-off dates from an external list.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>Anyone with manage access to the content calendar.</p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Either path only creates internal <code>idea</code>-status drafts
              — nothing is published automatically. Everything still goes
              through the normal sign-off on the main{" "}
              <Link
                href="/portal/calendar"
                className="underline hover:text-foreground"
              >
                Calendar
              </Link>{" "}
              page.
            </li>
            <li>
              New rows count toward that same page&apos;s audit log, just like
              any other calendar item.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Assuming a generated or imported item is already public — it
              isn&apos;t, until someone reviews it and sets its status and
              visibility on the Calendar page.
            </li>
            <li>
              Re-importing the same CSV can create duplicate one-off items —
              check the target year&apos;s coverage first. Re-running Generate
              all for an already-covered year is harmless, since it only fills
              gaps.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/inventory/distribution": {
    title: "How distribution works",
    description: "Recording items leaving inventory.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Item leaves inventory</strong>{" "}
              — record which item, how many, and when.
            </li>
            <li>
              <strong className="text-foreground">
                Event and recipient are optional
              </strong>{" "}
              — tie a distribution to an event and/or a recipient when it&apos;s
              relevant, or leave them blank for a general distribution.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Anyone with manage access to inventory or inventory intake — this
            includes <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">volunteer</strong> (volunteers
            can edit distribution/gear-checkout records even though they
            don&apos;t get full Inventory reports access).
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              There&apos;s no approval step — recording a distribution here
              immediately reduces the item&apos;s on-hand quantity.
            </li>
            <li>
              It&apos;s written to the audit log against the item&apos;s
              movement history, alongside its receive and adjustment
              transactions.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Recording a new distribution to fix an earlier mistake, when a
              correction/adjustment would keep the on-hand total accurate
              instead of two movements fighting each other.
            </li>
            <li>
              Leaving the recipient blank for a personal handout makes the item
              impossible to trace back to who took it later.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/inventory/reports": {
    title: "How inventory valuation is counted",
    description: "What counts toward each figure, and the date window it uses.",
    body: (
      <>
        <HowToSection heading="What counts">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Total on-hand value and Items on-hand
              </strong>{" "}
              — the face value and count of every item currently in{" "}
              <strong className="text-foreground">Available</strong> status.
              This is a live snapshot, not scoped to the date range below.
            </li>
            <li>
              <strong className="text-foreground">
                Value donated and Value distributed
              </strong>{" "}
              — face value times quantity of <code>received</code> and{" "}
              <code>distributed</code> movements whose date falls in the From/To
              range, which defaults to the current month. Value donated also
              breaks its total into{" "}
              <strong className="text-foreground">Sponsors &amp; orgs</strong>{" "}
              and <strong className="text-foreground">Individuals</strong>,
              using the donor&apos;s source type on the donation behind each
              item.
            </li>
            <li>
              <strong className="text-foreground">
                On-hand value by type and by status
              </strong>{" "}
              — by type covers Available items only; by status breaks all seven
              statuses (Available, Reserved, Distributed, Damaged, Lost,
              Retired, Other) out separately. Neither is affected by the date
              range.
            </li>
            <li>
              <strong className="text-foreground">
                Donated value by donor type
              </strong>{" "}
              — the same <code>received</code> value and item count as the Value
              donated card, split into Sponsors &amp; orgs (donors whose source
              type is Brand or Organization), Individuals, and Other (Event or
              Other). Unlike the two tables above, this one <em>is</em> scoped
              to the date range. An{" "}
              <strong className="text-foreground">Unattributed</strong> row
              appears only if a donation or donor could not be read, which needs
              a role holding inventory reports access without Finance or People
              view.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> holds manage and{" "}
            <strong className="text-foreground">finance</strong> holds view;{" "}
            <strong className="text-foreground">event_coordinator</strong>,{" "}
            <strong className="text-foreground">board</strong>, and{" "}
            <strong className="text-foreground">volunteer</strong> have no
            access at all, even though volunteer can record donations and
            distributions elsewhere in Inventory.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            Changing the date range re-runs Value donated, Value distributed,
            and Donated value by donor type — the on-hand cards and the by-type
            and by-status tables always reflect the catalog&apos;s current
            state. Nothing here is cached.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Expecting Value donated for a range to match items still shown
              Available today — it only reflects when the <code>received</code>{" "}
              movement happened, not an item&apos;s current status, so a donated
              item since reserved or distributed still counts.
            </li>
            <li>
              Reading the Distributed row in the by-status table as the same
              number as Value distributed for the selected range — the by-status
              count is a current-status snapshot with no date filter, while
              Value distributed is movement-based and scoped to the range, so
              they can diverge.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/inventory/donations": {
    title: "How donation intake works",
    description:
      "Recording a donor and items together, and what's fixed after.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Add donation</strong> —
              creates the donor and every item in one step; at least one item is
              required.
            </li>
            <li>
              <strong className="text-foreground">Donor</strong> — marking a
              donation Anonymous always creates a fresh donor record. A named
              donor with an email is matched against an existing People record
              by that email first, so repeat donations from the same person link
              to one record instead of duplicating it. Donor source (Individual,
              Brand, Organization, Event, Other) is recorded per donation.
            </li>
            <li>
              <strong className="text-foreground">Items</strong> — each item
              becomes its own inventory item with Available status and a{" "}
              <code>received</code> movement of quantity 1, which is what feeds
              the{" "}
              <Link
                href="/portal/inventory/reports"
                className="underline hover:text-foreground"
              >
                Inventory Reports
              </Link>{" "}
              &quot;Value donated&quot; figure.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Seeing this list needs inventory view or manage access on{" "}
            <strong className="text-foreground">
              Donation intake &amp; distribution
            </strong>{" "}
            — in practice <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">volunteer</strong>. Recording a
            new donation needs that same intake access, but editing an existing
            one afterward needs full Inventory or Finance manage instead — so a
            volunteer can add a donation but can&apos;t edit it once it&apos;s
            saved.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            Donated items appear immediately in the{" "}
            <Link
              href="/portal/inventory/items"
              className="underline hover:text-foreground"
            >
              Items catalog
            </Link>{" "}
            and count toward Inventory Reports for the date they were received.
            It&apos;s written to the audit log.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Expecting the edit sheet to fix a wrong donor name, source, or
              item — editing a donation only changes the date received and
              notes; donor identity and items are fixed at intake.
            </li>
            <li>
              A volunteer expecting to edit a donation they just added — that
              needs Inventory or Finance manage access, which the intake
              carve-out doesn&apos;t grant.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/governance/meetings": {
    title: "How meeting records work",
    description: "Meeting lifecycle and the records tied to each meeting.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Scheduled</strong> — a meeting
              is created with a date, type, facilitator, and notetaker. Every
              meeting starts here.
            </li>
            <li>
              <strong className="text-foreground">During and after</strong> —
              opening a meeting&apos;s row shows six tabs covering the whole
              record: Overview, Attendees, Agenda, Action Items, Decisions, and
              Resolutions — all keyed to that same meeting.
            </li>
            <li>
              <strong className="text-foreground">
                Completed or cancelled
              </strong>{" "}
              — the meeting&apos;s status is updated once it&apos;s actually
              happened or been called off.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">board</strong> manage meetings
            and their sub-records; no other role has access to Governance.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Attendees, agenda items, decisions (with votes), action items
              (with owners), and resolutions are all logged from their own tab,
              independent of the meeting&apos;s overall status.
            </li>
            <li>
              Governance records aren&apos;t written to the audit log yet,
              unlike expenses, users, and calendar items.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Leaving a meeting&apos;s status as Scheduled after it happens
              makes it look upcoming in board views.
            </li>
            <li>
              Recording a vote as a Decision instead of a Resolution (or vice
              versa) — decisions are lightweight per-meeting entries, while
              resolutions carry motion text, a mover/seconder, and an effective
              date for the formal record.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/governance/resolutions": {
    title: "How resolutions work",
    description:
      "One shared list — the full record here, a meeting's own subset there.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Same table, two views</strong>{" "}
              — this page and a meeting&apos;s own Resolutions tab read and
              write the exact same records. This page lists every resolution
              across all meetings, plus any recorded with no meeting attached; a
              meeting&apos;s tab shows only that meeting&apos;s.
            </li>
            <li>
              <strong className="text-foreground">Meeting is optional</strong> —
              attach one to tie the motion to that meeting&apos;s record, or
              leave it unset for a resolution recorded independently.
            </li>
            <li>
              Motion text and a mover are required; seconder, vote outcome
              (pending, passed, failed, tabled), and effective date fill out the
              formal record.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">board</strong> hold manage on
            governance, which covers meetings, decisions, and resolutions
            together; no other role has access.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            Adding, editing, or deleting a resolution from either place shows up
            immediately in the other — it&apos;s the same row, just filtered
            differently.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Assuming this page and a meeting&apos;s Resolutions tab track
              separate records — editing one is editing the same row seen on the
              other.
            </li>
            <li>
              Recording a routine vote here instead of as a Decision on the
              meeting&apos;s own tab — see{" "}
              <Link
                href="/portal/governance/meetings"
                className="underline hover:text-foreground"
              >
                Meetings
              </Link>{" "}
              for that distinction.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/finance/reports": {
    title: "How these figures are counted",
    description: "What counts toward income, expenses paid, and net.",
    body: (
      <>
        <HowToSection heading="What counts">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Income</strong> is event
              revenue by the date it was received, plus completed{" "}
              <Link
                href="/portal/finance/sales"
                className="underline hover:text-foreground"
              >
                merchandise sales
              </Link>{" "}
              by the date they were rung up. A voided sale counts for nothing.
              Sponsorship commitments are tracked separately and are not counted
              here.
            </li>
            <li>
              <strong className="text-foreground">Expenses paid</strong> counts
              only{" "}
              <Link
                href="/portal/finance/expenses"
                className="underline hover:text-foreground"
              >
                expenses
              </Link>{" "}
              and{" "}
              <Link
                href="/portal/finance/reimbursements"
                className="underline hover:text-foreground"
              >
                reimbursements
              </Link>{" "}
              marked paid, so the net reflects money that has actually left the
              account. Submitted and approved-but-unpaid spend is listed below
              it, and rejected spend never counts toward any total.
            </li>
            <li>
              <strong className="text-foreground">In-kind donations</strong> is
              the face value of items donated in the period. It is not cash, so
              it stays out of the net. Monetary donations are cash received and
              are counted, as their own figure alongside Income.
            </li>
            <li>
              Expenses count by the date the cost was incurred; reimbursements
              have no such date, so they count by the date the request was
              recorded.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">finance</strong> see the live
            figures; <strong className="text-foreground">board</strong> gets a
            view-only version for oversight; other roles have no access to
            Finance reports.
          </p>
        </HowToSection>
        <HowToSection heading="The default range is the fiscal year">
          <p>
            The page opens on fiscal-year-to-date, not calendar-year-to-date:
            from the first day of the current fiscal year through today. Under a
            July start that means a report opened in January reaches back to the
            previous July rather than to January 1, so a winter season stays
            whole. &ldquo;Reset to FY2027&rdquo; returns to that default from
            any range you&apos;ve typed. The start month is set in{" "}
            <Link
              href="/portal/administration/organization-settings"
              className="underline hover:text-foreground"
            >
              Organization Settings
            </Link>
            .
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            Changing the date range re-runs the same report live — nothing is
            cached, so figures always reflect the current state of expenses,
            reimbursements, revenue, sales, and donations.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Reading Net as cash-on-hand — it only reflects paid spend, so an
              approved-but-unpaid expense doesn&apos;t reduce Net yet, even
              though it&apos;s committed.
            </li>
            <li>
              Picking a From date after the To date returns nothing; the page
              will tell you to fix the range.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/finance/revenue": {
    title: "How event revenue works",
    description: "Recording non-sponsorship income, and where it's counted.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Source</strong> — ticket
              sales, registration fees, onsite donations, grants, or other.
              Event and notes are optional.
            </li>
            <li>
              <strong className="text-foreground">Not for merchandise</strong> —
              merchandise is rung up at the{" "}
              <Link
                href="/portal/finance/sales/register"
                className="underline hover:text-foreground"
              >
                sales register
              </Link>
              , which prices it from the catalog and moves stock. Rows recorded
              here before the register existed keep their Merchandise source and
              still count once.
            </li>
            <li>
              <strong className="text-foreground">Not for sponsorships</strong>{" "}
              — sponsorship commitments are tracked on the event&apos;s own
              Sponsors tab instead, so a sponsorship recorded here would double
              count against that.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong>,{" "}
            <strong className="text-foreground">event_coordinator</strong>, and{" "}
            <strong className="text-foreground">finance</strong> all hold
            manage; <strong className="text-foreground">board</strong> and{" "}
            <strong className="text-foreground">volunteer</strong> have no
            access at all — unlike most other Finance pages, there&apos;s no
            view-only tier here.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            Each record counts toward{" "}
            <Link
              href="/portal/finance/reports"
              className="underline hover:text-foreground"
            >
              Finance Reports
            </Link>
            &apos;s Income figure, by the date it was received, and is written
            to the audit log.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <p>
            Recording a sponsor&apos;s commitment here instead of under the
            event&apos;s Sponsors tab — this table deliberately excludes
            sponsorship so a future combined rollup doesn&apos;t count it twice.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/finance/sales": {
    title: "Reading the sales ledger",
    description: "What a recorded sale is, and what voiding one does.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Find the sale</strong> —
              filter by event, status or payment, or search what was in it, who
              bought it, or the note.
            </li>
            <li>
              <strong className="text-foreground">Open it</strong> to see the
              items at the prices they were sold for, the purchaser, and the
              note.
            </li>
            <li>
              <strong className="text-foreground">Correct it</strong> — the
              pencil edits which event it belongs to and the note. Nothing else
              about a recorded sale is editable.
            </li>
            <li>
              <strong className="text-foreground">Print the receipt</strong> —
              the printer icon opens it in a new tab, where{" "}
              <em>Print / Save as PDF</em> hands it to your browser&apos;s print
              dialog. Choose your printer for paper, or &ldquo;Save as
              PDF&rdquo; for a file to email.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Receipts">
          <p>
            Every sale has a receipt with its own number — #000123 — from the
            moment it is recorded, so a buyer can quote it back to you later.
            Nothing is stored: the receipt is built from the sale each time you
            open it, at the prices it was actually sold for, so one printed next
            year says exactly what it said on the day. A voided sale still has a
            receipt, printed with a <strong>VOIDED</strong> banner across it,
            and it keeps the number it always had.
          </p>
          <p className="mt-2">
            A receipt shows the items, the totals and the buyer&apos;s name. It
            never shows their email or phone, the note on the sale, or who rang
            it up.
          </p>
        </HowToSection>
        <HowToSection heading="Void, not delete">
          <p>
            A sale is never deleted. Voiding puts its items back into stock,
            stops it counting toward income, and keeps the row with who voided
            it and why — so the ledger still explains itself. Getting a total
            wrong means voiding the sale and ringing it up again, which is also
            what a refund looks like here.
          </p>
        </HowToSection>
        <HowToSection heading="Payment happens outside the system">
          <p>
            Nothing here takes money. The cash box, card reader or payment app
            does that, and this records that it happened, for how much and by
            what means — the same arrangement giveaway ticket sales use.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/finance/sales/register": {
    title: "Ringing up a sale",
    description: "Building a cart and recording what was paid.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Tap products</strong> to build
              the cart; tap again, or use the + and −, for more than one. A tile
              shows what is left and goes out when there is none.
            </li>
            <li>
              <strong className="text-foreground">
                Set the event and payment
              </strong>{" "}
              — the event is guessed from what is happening now, and payment
              defaults to cash. Both stay put for the next sale.
            </li>
            <li>
              <strong className="text-foreground">
                Discount and purchaser are optional
              </strong>{" "}
              — the discount comes off the whole sale, and naming a purchaser
              attaches it to their record in People.
            </li>
            <li>
              <strong className="text-foreground">
                Change one item&apos;s price
              </strong>{" "}
              by tapping the price on its line in the cart — a damaged shirt at
              half price, say. It applies to that sale only, and the ledger
              keeps the catalog price beside it so the change is visible later.
            </li>
            <li>
              <strong className="text-foreground">Custom item</strong>, the last
              tile, is for something that is not in the catalog at all — a
              donated one-off, a coffee. Give it a description and a price. It
              moves no stock, because there was never any to count.
            </li>
            <li>
              <strong className="text-foreground">Record the sale</strong> after
              the money has been taken. Stock comes down as it saves.
            </li>
            <li>
              <strong className="text-foreground">Hand over a receipt</strong>{" "}
              if the buyer wants one — <em>Receipt</em> under the Record button
              opens it in a new tab with the print dialog already up. Print it,
              or save it as a PDF. The link stays there until the next sale, so
              it is still waiting after you have made change.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Payment happens outside the system">
          <p>
            Take the money first — cash box, card reader or payment app — then
            record it here. Nothing on this page charges anyone.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Leaving the register open between events: the event picker keeps
              whatever was last chosen, so check it before the first sale of the
              day.
            </li>
            <li>
              Trying to fix a recorded sale. Void it from the{" "}
              <Link
                href="/portal/finance/sales"
                className="underline hover:text-foreground"
              >
                ledger
              </Link>{" "}
              and ring it up again — that is what puts the stock back.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/finance/sales/products": {
    title: "Keeping the catalog",
    description: "Products, variants, prices and stock counts.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                A product needs at least one variant
              </strong>{" "}
              — the variant is what carries the price and the stock count, so a
              one-size product still gets one (&ldquo;One size&rdquo;). New
              Product creates both together.
            </li>
            <li>
              <strong className="text-foreground">Set stock by counting</strong>{" "}
              — the Stock field is what is in the box now, not a delta. Sales
              take units out on their own.
            </li>
            <li>
              <strong className="text-foreground">
                Merchandise is not the gear library
              </strong>{" "}
              — donated gear lives under Inventory, is tracked per piece and has
              no price. This is what gets sold.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Deactivate, don't delete">
          <p>
            Anything that has ever been sold can only be deactivated: deleting
            it would destroy the priced history a past receipt and the finance
            rollup read. A deactivated product or variant disappears from the
            register and keeps every sale it was part of.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/volunteers/participation": {
    title: "How hours logging works",
    description: "Logging volunteer hours and where they roll up.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Hours are logged directly
              </strong>{" "}
              — there&apos;s no approval step.
            </li>
            <li>
              <strong className="text-foreground">
                Event and role type are optional
              </strong>{" "}
              — tie an entry to an event and a role type when it&apos;s
              relevant, or leave them blank for general hours.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            A volunteer with logging access can log their own hours; anyone with
            manage access (<strong className="text-foreground">admin</strong>)
            can log hours for another volunteer too.{" "}
            <strong className="text-foreground">event_coordinator</strong> can
            view all entries but can&apos;t log on someone else&apos;s behalf.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Logged hours roll up into the total shown below and link back to
              the volunteer&apos;s record in People.
            </li>
            <li>
              They feed the Impact Tracking rollups (e.g. &quot;290 volunteer
              hours&quot; in a season report) once the entry is tied to a
              program&apos;s event.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Logging hours against the wrong event is easy to miss since
              there&apos;s no approval step to catch it later.
            </li>
            <li>
              Trying to log hours for another volunteer without manage access —
              the entry is rejected, since logging access only covers your own
              hours.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/volunteers/applications": {
    title: "How volunteer applications work",
    description: "The status lifecycle, and who can move an application along.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                new → being reviewed → contacted → placed
              </strong>{" "}
              — the expected path, or{" "}
              <strong className="text-foreground">declined</strong> /{" "}
              <strong className="text-foreground">closed</strong> at any point.
              Nothing advances automatically — someone with manage access sets
              each status from the application&apos;s details sheet.
            </li>
            <li>
              <strong className="text-foreground">
                Not linked to People or Roles
              </strong>{" "}
              — marking an application <code>placed</code> doesn&apos;t create
              or attach a People record or a role-type assignment on its own; do
              that separately if the applicant is joining as a volunteer.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong>,{" "}
            <strong className="text-foreground">event_coordinator</strong>, and{" "}
            <strong className="text-foreground">volunteer</strong> can all view
            this list, but only{" "}
            <strong className="text-foreground">admin</strong> holds manage on
            Volunteers — the status dropdown only appears for admin; everyone
            else sees the current status as read-only text.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            A status change only updates this record — there&apos;s no automated
            email to the applicant and nothing else in the portal reacts to it.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Assuming <code>placed</code> means the person is now set up as a
              volunteer elsewhere — it doesn&apos;t touch{" "}
              <Link
                href="/portal/people"
                className="underline hover:text-foreground"
              >
                People
              </Link>{" "}
              or{" "}
              <Link
                href="/portal/volunteers/roles"
                className="underline hover:text-foreground"
              >
                Roles
              </Link>
              , so follow up manually if they&apos;ll keep volunteering.
            </li>
            <li>
              Expecting an event_coordinator to advance a status — they can open
              and read an application, but the Status control stays disabled
              since they hold view, not manage.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/programs/reports": {
    title: "How the program impact rollup is counted",
    description: "What feeds each figure, and the event-linkage it needs.",
    body: (
      <>
        <HowToSection heading="What counts">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Participants, first-time and beginner figures
              </strong>{" "}
              — computed from each event&apos;s attendance headcount, check-ins
              and the rider levels recorded at check-in. Nothing is typed.
            </li>
            <li>
              <strong className="text-foreground">
                Rental subsidies and participant assistance
              </strong>{" "}
              — rental subsidies are rental discount codes given to registrants
              who didn&apos;t cancel; assistance adds up the value of assigned
              codes, the value of items given out, and paid expenses marked
              participant assistance. Codes on an event that gives one to every
              registrant don&apos;t count. Figures typed by hand on older events
              are archived on those events and never added in.
            </li>
            <li>
              <strong className="text-foreground">
                Discount value offered
              </strong>{" "}
              — what the event&apos;s shared and single-use codes were worth,
              from the options each covers and the prices registrants chose them
              at. Shown on its own and never added to assistance: the codes are
              redeemed on the partner&apos;s site, so nothing says they were
              used.
            </li>
            <li>
              <strong className="text-foreground">Equipment distributed</strong>{" "}
              — summed from inventory movements of type <code>distributed</code>{" "}
              tied to the program&apos;s events.
            </li>
            <li>
              <strong className="text-foreground">Volunteer hours</strong> —
              summed only from hours entries tied to one of the program&apos;s
              events; hours logged with no event, or against an event not
              assigned to this program, don&apos;t count.
            </li>
            <li>
              <strong className="text-foreground">Repeat participants</strong> —
              people registered for two or more of the program&apos;s events.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">event_coordinator</strong> hold
            manage, <strong className="text-foreground">finance</strong> and{" "}
            <strong className="text-foreground">board</strong> hold view, and{" "}
            <strong className="text-foreground">volunteer</strong> has no access
            — a narrower split than most other reports, since this rollup
            surfaces per-event financial-assistance figures.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            There&apos;s no date range — each season is its own{" "}
            <Link
              href="/portal/programs"
              className="underline hover:text-foreground"
            >
              program
            </Link>{" "}
            row, so selecting a program rolls up every event ever assigned to
            it, computed live with nothing cached.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Logging volunteer hours without tying the entry to an event, or to
              an event that isn&apos;t assigned to this program — either way
              those hours won&apos;t reach this rollup.
            </li>
            <li>
              Leaving a discount code&apos;s kind and value blank, or an expense
              for participants unmarked — the help was given, but nothing says
              so, so it can&apos;t reach the assistance figures.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/technology": {
    title: "How access management works",
    description: "Sensitivity, review cadence, and the access grant lifecycle.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Sensitivity</strong> — Low,
              Medium, High, or Critical drives how often the asset should be
              reviewed (annually for Low/Medium, every 6 months for High, every
              3 for Critical) and the expected MFA and two-admin coverage for
              it.
            </li>
            <li>
              <strong className="text-foreground">Record review</strong> — sets
              Last reviewed to today and computes Next review from that cadence.
            </li>
            <li>
              <strong className="text-foreground">Access grants</strong> — add a
              grant per person with an access level and optional expiry; Verify
              logs a check without changing anything else; Revoke ends it for
              good.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Unlike the rest of Administration, this page isn&apos;t admin-only:
            manage access on{" "}
            <strong className="text-foreground">
              Access management assets
            </strong>{" "}
            covers everything above, while manage access on{" "}
            <strong className="text-foreground">
              Access management reviews
            </strong>{" "}
            only covers Record review and Verify — not creating, editing, or
            deleting assets or grants.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Sensitivity&apos;s review cadence and MFA/two-admin expectations
              are advisory only — nothing blocks saving an asset that falls
              short of its own tier&apos;s expectations.
            </li>
            <li>
              A grant past its Expires date isn&apos;t automatically marked
              expired or revoked — it stays active until someone verifies or
              revokes it.
            </li>
            <li>
              Revoking a grant keeps the row for the audit trail rather than
              deleting it; re-adding the same person afterward creates a new
              grant instead of reactivating the old one.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              This is not a credential store — never enter a password, API key,
              token, or recovery code; Account identifier is only an email or
              username.
            </li>
            <li>
              The asset page&apos;s Audit history card only shows changes to the
              asset record itself (name, sensitivity, review dates, and so on) —
              grant activity lives in the full{" "}
              <Link
                href="/portal/administration/audit-log?table=access_grants"
                className="underline hover:text-foreground"
              >
                audit log
              </Link>
              , filtered to Access grants.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  // One entry for one page: #946 merged Permissions into Roles as a tab, and
  // the help registry is keyed on the pathname, which a tab does not change.
  "/portal/administration/roles": {
    title: "How roles and permissions work",
    description: "Naming a role on one tab, granting it access on the other.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              On <strong className="text-foreground">All roles</strong>,
              &ldquo;New role&rdquo; gives the role a name and an optional
              description. That is its identity — on its own it grants nothing.
            </li>
            <li>
              On <strong className="text-foreground">Permissions</strong>, pick
              the role, open the section holding the resource, and set it to{" "}
              <strong className="text-foreground">None</strong>,{" "}
              <strong className="text-foreground">View</strong>, or{" "}
              <strong className="text-foreground">Manage</strong>. Manage
              includes everything View does, plus the ability to create, edit,
              or delete. The help icon beside a resource&apos;s name says what
              that particular grant covers, what it does not, and which roles
              hold it today.
            </li>
            <li>
              &ldquo;Save changes&rdquo; lists every cell you changed and asks
              you to confirm before any of it is written; &ldquo;Discard
              changes&rdquo; throws the whole batch away. Nothing is saved cell
              by cell as you go.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> —
            Administration (users, permissions, settings, audit log) is
            admin-only across the whole portal.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Route guards and the sidebar nav both read this same matrix on
              every request, so a role loses or gains a page immediately — no
              re-login, no deploy.
            </li>
            <li>
              The built-in roles (admin, event_coordinator, finance, board,
              volunteer) keep the names the platform grants permissions by —
              give one a different display name instead. Only admin can&apos;t
              be deleted.
            </li>
            <li>
              A role still assigned to any user can&apos;t be deleted either —
              the error names how many users are affected.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Creating a role and assigning someone to it without opening the
              Permissions tab leaves that person with no page access at all.
            </li>
            <li>
              Removing the last admin&apos;s Manage on Administration locks
              everyone, including you, out of this page — keep at least one
              admin with full access.
            </li>
            <li>
              A role with View but not Manage on a resource can still open that
              page, but every create/edit/delete action on it stays disabled or
              hidden.
            </li>
            <li>
              Only the resources for modules your organization has are listed. A
              section you expected and can&apos;t find is a module that is off,
              not a permission that went missing.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/permission-reference": {
    title: "What each permission grants",
    description:
      "The whole catalog, level by level, with the neighbours it excludes.",
    body: (
      <>
        <HowToSection heading="What this page answers">
          <p>
            For every permission in the matrix: what <strong>View</strong> lets
            someone do, what <strong>Manage</strong> adds, which sidebar entries
            the grant reveals, which roles in this organization hold it, and —
            the question most grants get wrong — which neighbouring permission
            covers what it doesn&apos;t. Granting Finance does not grant expense
            approvals, event expenses, or the finance reports a board member
            reads; each has its own row.
          </p>
        </HowToSection>
        <HowToSection heading="Reading it">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              The filter matches a name, a section, or the underlying key, so
              &ldquo;expense&rdquo; finds every permission that touches one.
            </li>
            <li>
              A permission marked <strong>Module off</strong> is one your
              organization does not have. The grant can be set and does nothing
              until the module is switched back on — which is also why it is
              missing from the matrix.
            </li>
            <li>
              A permission with no sidebar entry is not unused: it widens what
              pages and actions elsewhere allow, without adding a destination of
              its own.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Changing anything">
          <p>
            Nothing here is editable. Grants are set on{" "}
            <Link
              href="/portal/administration/roles?tab=permissions"
              className="underline underline-offset-2"
            >
              Roles → Permissions
            </Link>
            , and take effect on the next request — no re-login, no deploy.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/audit-log": {
    title: "How the audit log works",
    description: "What's tracked automatically, and what isn't yet.",
    body: (
      <>
        <HowToSection heading="Steps">
          <p>
            Filter by table, action, actor, and date range, then open a row to
            see the change itself — a before/after diff for an update, or the
            full record for an insert or delete.
          </p>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> — this page
            is view-only and admin-only like the rest of Administration.
          </p>
        </HowToSection>
        <HowToSection heading="What's tracked">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Most write-heavy portal records are logged automatically:
              donations, inventory, event expenses, user roles, app settings,
              calendar items, social posts, and access management&apos;s
              services, assets, and grants, among others.
            </li>
            <li>
              Governance records (meetings, decisions, resolutions) and event
              edits aren&apos;t written here yet — see those pages&apos; own
              guidance.
            </li>
            <li>
              The Table filter above doesn&apos;t yet list every audited table —
              reimbursements, event revenue, deactivated users, and monetary
              donations are logged but only show up while it&apos;s left on
              &quot;All tables&quot;.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Assuming a table missing from the filter dropdown isn&apos;t
              tracked — check &quot;All tables&quot; first before concluding
              that.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  // One entry for all five tabs: help is keyed by route, not by `?tab=`
  // (#1491). Sections follow the tab order, each heading naming its tab.
  "/portal/administration/organization-settings": {
    title: "How organization settings are used",
    description:
      "What each tab controls, and why some changes follow a Board decision.",
    body: (
      <>
        <HowToSection heading="General: the fiscal year">
          <p>
            The fiscal year decides what &ldquo;this year&rdquo; means
            everywhere else in the portal: the dashboard&apos;s financial
            figures, the default range on Financial Reports, the annual planning
            review, and the year a conflict-of-interest disclosure covers. A
            July 1 – June 30 year keeps a winter season inside one year rather
            than splitting it at New Year, and a fiscal year is named for the
            calendar year it ends in, so FY2027 is July 2026 through June 2027.
          </p>
          <p>
            Under the bylaws the fiscal year is set by Board resolution, so
            changing the month here should follow that resolution rather than
            lead it: every annual figure moves with it.
          </p>
        </HowToSection>
        <HowToSection heading="General: the time zone">
          <p>
            The time zone says where this organization&apos;s days begin and
            end, so reports count a day the way the staff would. A sale rung or
            a reimbursement filed at 7pm on the last day of February counts in
            February, not in March. It sets the default period on Financial
            Reports, the dashboard&apos;s &ldquo;this month&rdquo; figures and
            the annual planning review.
          </p>
          <p>
            It does not change how times are shown. The portal always shows you
            a time in your own browser&apos;s zone, and the public site shows an
            event in the zone the event is held in.
          </p>
        </HowToSection>
        <HowToSection heading="General: vocabulary">
          <p>
            The platform says &ldquo;inventory&rdquo; and &ldquo;items&rdquo;;
            yours may be a gear library, a tool library or a pantry. Those words
            are what the public navigation, this portal&apos;s sidebar and the
            unwritten parts of your site copy use.
          </p>
          <p>
            The platform says &ldquo;donors&rdquo; and &ldquo;volunteers&rdquo;;
            yours may have members, students, customers or clients. Those words
            are what the People section of the sidebar, its pages, the role
            filter and every person&apos;s profile use. Only the words change: a
            role is still set by the donation, registration or shift behind it,
            whatever you call the person who did it.
          </p>
        </HowToSection>
        <HowToSection heading="Workflow settings: approval thresholds">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Below the threshold</strong> —
              someone with <em>Self-approve own expenses</em> (or{" "}
              <em>own reimbursements</em>) can approve their own submission on
              the{" "}
              <Link
                href="/portal/finance/expenses"
                className="underline hover:text-foreground"
              >
                Expenses
              </Link>{" "}
              or{" "}
              <Link
                href="/portal/finance/reimbursements"
                className="underline hover:text-foreground"
              >
                Reimbursements
              </Link>{" "}
              page, so routine spending doesn&apos;t wait on a second person.
            </li>
            <li>
              <strong className="text-foreground">
                At or above the threshold
              </strong>{" "}
              — someone with <em>Expense approvals</em> (or{" "}
              <em>Reimbursement approvals</em>) other than whoever submitted it
              has to approve or reject it instead.
            </li>
          </ol>
          <p className="mt-2">
            The approval pages read the threshold each time a submission is
            opened, so a change applies straight away. Setting it to 0 sends
            every submission, however small, to a second approver; a threshold
            that was never set does the same rather than switching approval off.
          </p>
        </HowToSection>
        <HowToSection heading="Workflow settings: sales tax">
          <p>
            The rate is prefilled on every sale at the register, where the
            cashier can change it for that one sale. Tax is added on top of the
            pre-tax prices in the catalog, and what is collected is reported
            separately from income, because it is owed to the state rather than
            earned. Changing the rate here never alters a sale already recorded.
          </p>
        </HowToSection>
        <HowToSection heading="Branding">
          <p>
            A blank field keeps the platform default. Saving restyles the public
            site, your links page and this portal at once, so the page you are
            on changes as soon as the save lands.
          </p>
          <p>
            The logo appears in the site header and footer, the portal sidebar
            and at the top of every email, so it has to load for someone who
            isn&apos;t signed in to anything. A Google Drive file must be shared
            as &ldquo;Anyone with the link&rdquo;; one that only opens while you
            are signed in to Drive shows as a broken image in an inbox. The app
            icon is what a phone shows when someone installs the portal; left
            blank, it shows your initials on your brand colour, which usually
            reads better than a wide logo cropped to a circle.
          </p>
        </HowToSection>
        <HowToSection heading="Notifications: the outbound email switch">
          <p>
            It is a stop, not a preference. Each person chooses what they want
            in{" "}
            <Link
              href="/portal/account"
              className="underline hover:text-foreground"
            >
              My Account
            </Link>
            , and this overrides all of them, including the receipts set up
            under{" "}
            <Link
              href="/portal/administration/automatic-replies"
              className="underline hover:text-foreground"
            >
              Automatic Replies
            </Link>{" "}
            and the daily ops report. Turn it off if messages are going
            somewhere they shouldn&apos;t. Nothing queues while it is off, so
            turning it back on does not send what was missed.
          </p>
        </HowToSection>
        <HowToSection heading="Notifications: sending and the ops report">
          <p>
            Everything the portal sends goes out under your organization&apos;s
            name, from a sending address that nobody reads. The Reply-To is
            where a reply lands instead; without it, a reply bounces. Sending
            from your own address needs your platform operator to verify your
            domain with the email provider first, because mail from an
            unverified domain is rejected or marked as spam; the field stays
            read-only until they have.
          </p>
          <p>
            Each morning the ops report&apos;s addresses get a summary of the
            day: approvals waiting, events and shift gaps in the next week, new
            messages and applications, and donations received. It goes by
            address rather than to a person because it is usually a shared inbox
            such as board@ or leadership@, so nobody can opt in or out of it on
            their own account.
          </p>
        </HowToSection>
        <HowToSection heading="Notifications: reading who receives what">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Staff notifications</strong>{" "}
              reach a person only if they hold the role that owns the queue{" "}
              <em>and</em> turned the notification on themselves. A warning
              badge marks either gap: someone with the role who has not opted
              in, or someone opted in without the role, who gets nothing.
              Preferences are each person&apos;s own, so this page shows them
              but cannot change them.
            </li>
            <li>
              <strong className="text-foreground">
                Receipts to the public
              </strong>{" "}
              go to whoever fills in the form, unless they turned that receipt
              off for themselves. The count shows how many have. A receipt
              switched off under Automatic Replies goes to nobody.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Data">
          <p>
            The export is one file with every record the organization holds
            here, people included, so it contains personal data: store it as
            carefully as the portal does and delete it once it has served its
            purpose.
          </p>
          <p>
            Deleting the organization can&apos;t be undone and takes the audit
            trail and the site with it, so it isn&apos;t a button. The platform
            operator carries it out once the organization is archived, on a
            request from an admin account. Take an export first.
          </p>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Anyone whose role has{" "}
            <strong className="text-foreground">Administration</strong> or{" "}
            <strong className="text-foreground">System settings</strong> at
            Manage can open this page and change every tab on it. Which roles
            hold those is set per organization under{" "}
            <Link
              href="/portal/administration/roles"
              className="underline hover:text-foreground"
            >
              Roles
            </Link>
            . Every change here is written to the audit log, so you can see who
            changed what and when.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/users": {
    title: "How user access works",
    description: "Active users, pending grants, and invite links.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Active users</strong> — an
              admin assigns or removes roles directly on an existing account, or
              deactivates it. Deactivating revokes portal access immediately but
              keeps their roles on file for reactivation.
            </li>
            <li>
              <strong className="text-foreground">Pending access</strong> — new
              access instead starts by staging an email and role below. That
              creates a grant with status <code>pending</code>.
            </li>
            <li>
              <strong className="text-foreground">Invite</strong> — clicking
              Invite generates a one-time link, valid for about an hour. Nothing
              is emailed automatically — you have to copy the link and share it
              yourself.
            </li>
            <li>
              <strong className="text-foreground">Claimed or revoked</strong> —
              the grant becomes <code>claimed</code> once the person signs up
              with that link, or an admin can <code>revoke</code> it beforehand.
              An unused link that passes its hour shows as Expired but stays
              revocable/re-inviteable.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> can grant,
            edit, or revoke access.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Deactivating a user revokes portal access on their very next
              request — there&apos;s no session to clear or grace period.
            </li>
            <li>
              Role assignments, deactivations, and pending-grant changes are all
              written to the audit log.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Forgetting to copy and send the invite link — nothing is emailed
              for you, so the pending grant just sits there until someone shares
              it.
            </li>
            <li>
              Revoking your own admin role removes your own access immediately —
              have another admin do it if you&apos;re stepping back.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/data-retention": {
    title: "How retention rules work",
    description:
      "Off, preview, or enforcing — and what the nightly job removes.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              Set a rule to{" "}
              <strong className="text-foreground">Preview only</strong>, then
              use &quot;Run a preview now&quot; and read its per-table counts in
              Run history. A rule in preview records what it would remove
              without removing anything.
            </li>
            <li>
              Once a few nights of counts look right, switch that one rule to{" "}
              <strong className="text-foreground">Enforcing</strong>. Modes are
              per-rule on purpose — a category is reviewed and turned on by
              itself rather than the whole job being flipped at once.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> — this page
            needs Manage on Administration, like the rest of the section.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              A nightly job sweeps every rule and writes a run log either way; a
              rule only removes anything while its mode is Enforcing. Rate-limit
              hits are swept hourly instead, because they churn fast and the
              sweep is cheap.
            </li>
            <li>
              The periods themselves aren&apos;t editable here — they&apos;re
              the ones published in the{" "}
              <PublicSiteLink path="/privacy" className="underline">
                privacy policy
              </PublicSiteLink>
              , and changing one is a code change so the two can&apos;t drift.
              This page controls only whether each rule is off, previewing, or
              enforcing.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Looking for a &quot;purge now&quot; button. There deliberately
              isn&apos;t one — it would be a one-click destructive operation
              over live donor and participant data with the review step skipped.
              Enforcement is the nightly job&apos;s alone.
            </li>
            <li>
              Assuming every record is subject to a rule. Donation and financial
              records are exempt, and a person is kept whenever any record still
              depends on them.
            </li>
            <li>
              Reading the rate-limit rule as this organization&apos;s. It is
              shared across the whole platform — those records identify a
              submitter, not an organization — so the shortest period anyone
              sets is the one that applies.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/automatic-replies": {
    title: "How automatic replies work",
    description:
      "The emails your public forms send straight back to whoever filled them in.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              Pick a reply from the list on the left. The grey number beside it
              is how many of its fields you have written yourself; everything
              else is the platform&apos;s wording.
            </li>
            <li>
              Rewrite the fields you want and check the preview beside them
              before saving. The portal keeps adding the details around your
              words — the event date and its calendar attachment, the reference
              code and its status link, the list of items requested.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> — this page
            needs Manage on Administration, like the rest of the section. Every
            change is recorded in the{" "}
            <Link href="/portal/administration/audit-log" className="underline">
              audit log
            </Link>
            .
          </p>
        </HowToSection>
        <HowToSection heading="What isn't set here">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Whether any email goes out at all, who it comes from, and where a
              reply goes are in{" "}
              <Link
                href="/portal/administration/organization-settings?tab=notifications"
                className="underline"
              >
                Organization Settings → Notifications
              </Link>
              . If email is switched off there, none of these replies is sent,
              whatever their own switches say.
            </li>
            <li>
              The logo, colours and footer around these words are your branding,
              not fields here — change those under{" "}
              <Link
                href="/portal/administration/organization-settings?tab=branding"
                className="underline"
              >
                Branding
              </Link>
              .
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/delivery-log": {
    title: "How the email delivery log works",
    description:
      "Every email the organization sends automatically, and what became of it.",
    body: (
      <>
        <HowToSection heading="Steps">
          <p>
            Filter by status, kind, recipient, record, and date range, then open
            a row to see what the email provider said about that send. To find
            all the mail about one submission, application or request, paste its
            id into the Record filter.
          </p>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> — this page
            is view-only and needs Manage on Administration, like the rest of
            the section.
          </p>
        </HowToSection>
        <HowToSection heading="What's logged">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Everything this organization&apos;s account sends on its own —
              receipts, notices to staff, the daily digest, the leadership
              report.
            </li>
            <li>
              Messages a staff member writes by hand appear on the record they
              are about, not here.
            </li>
            <li>
              No message text is kept — only who, what kind, and what happened.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="When an email is not sent">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              A row marked <strong className="text-foreground">Not sent</strong>{" "}
              says why it was skipped.
            </li>
            <li>
              Some sends stop before they reach this log and leave no row at
              all: when email is switched off for the whole organization, when
              an automatic reply is switched off for its kind, and when the
              person has no address on file. If a message you expected is
              missing entirely, check those three in{" "}
              <Link
                href="/portal/administration/organization-settings?tab=notifications"
                className="underline"
              >
                Organization Settings
              </Link>{" "}
              and{" "}
              <Link
                href="/portal/administration/automatic-replies"
                className="underline"
              >
                Automatic Replies
              </Link>
              .
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/platform": {
    title: "How platform administration works",
    description:
      "Provisioning organizations, domains, and status — metadata only.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              Provision an organization with its name, slug, plan, and
              optionally a first admin&apos;s email. The slug and the custom
              domain both have to be unique across the platform.
            </li>
            <li>
              Setting a custom domain here is one of three steps, not all of
              them — the Vercel project and Supabase&apos;s redirect URLs have
              to be updated too. The checklist beside the field spells out both.
            </li>
            <li>Suspend or archive an organization by changing its status.</li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Manage on Platform organizations, <em>and</em> full membership of an
            organization on the platform plan — the database checks the second
            on every action, so the page rendering isn&apos;t on its own a
            promise that an action will succeed.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              An invite link is minted for the first admin only when that
              address doesn&apos;t already have an account — otherwise they sign
              in with the account they have and claim the staged grant. Minting
              a link to an existing address is an account-takeover primitive, so
              it stays out of the browser.
            </li>
            <li>
              Support access stays each organization&apos;s to grant. The count
              shown here only reflects whether any is currently open.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Expecting an organization&apos;s data. Everything on this page is
              metadata — name, domain, plan, status — never what the
              organization holds.
            </li>
            <li>
              Looking for a delete button. Deleting an organization stays a
              two-step command so it remains a considered act.
            </li>
            <li>
              Setting a domain and stopping there. Without the Vercel and
              Supabase entries, invite links and OAuth callbacks to that domain
              are refused in a way that looks like a bug in the portal.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/website": {
    title: "How site content editing works",
    description: "Replacing the public website's words, slot by slot.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              Pick a page from the rail on the left and edit the slots on it.
              Each slot is one piece of copy — a heading, a run of paragraphs, a
              list, or a whole document — and slots are grouped into the
              sections they make up on the page.
            </li>
            <li>
              <strong className="text-foreground">Save draft</strong> stores
              what you have written without changing the public website.{" "}
              <strong className="text-foreground">Publish</strong> is the step
              that puts it live, and it shows you exactly which words change
              before it does. You can publish everything pending on the page, or
              one slot on its own with{" "}
              <strong className="text-foreground">Publish this</strong>.
            </li>
            <li>
              Search covers every page at once, not just the one you are on, so
              you can find a sentence without knowing which page carries it.
            </li>
            <li>
              A slot marked{" "}
              <strong className="text-foreground">Your text</strong> is yours
              and can be put back to the default; a slot with no marker is
              rendering the platform&apos;s text.{" "}
              <strong className="text-foreground">Unsaved</strong> marks what
              you have changed and not yet saved, and{" "}
              <strong className="text-foreground">Not published</strong> marks a
              saved draft the public site is not serving yet — the rail marks
              the same slots and counts them per page.{" "}
              <strong className="text-foreground">Discard</strong> throws away
              both.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            View on Site content opens this page read-only; drafting and
            publishing both need Manage.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Nothing you save is visible to the public until you publish it. A
              publish takes effect immediately, and both the draft and the
              publish are written to the{" "}
              <Link
                href="/portal/administration/audit-log?table=site_content"
                className="underline"
              >
                audit log
              </Link>
              . Each slot also carries who last drafted and published it, and
              when.
            </li>
            <li>
              Values are checked against the registry&apos;s expected shape
              before they&apos;re stored, because the public site reads these
              rows with no session behind it — a malformed value has to be
              refused here rather than discovered by a visitor.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Treating &quot;back to default&quot; as an undo of your own last
              edit. It stages a change back to the platform&apos;s wording, and
              publishing it drops your text; recovering what you had means
              retyping it or reading it out of the audit log.
            </li>
            <li>
              Saving and walking away. A saved draft is not on the website — the
              page list in the rail shows a highlighted count against any page
              still holding one.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/people": {
    title: "How the People directory works",
    description:
      "Contact records for donors, sponsors, and volunteers — not portal logins.",
    body: (
      <>
        <HowToSection heading="Steps">
          <p>
            <strong className="text-foreground">
              Donor, Sponsor, and Volunteer
            </strong>{" "}
            are independent flags on one contact record, not separate lists — a
            single person can hold any combination. Filter by role or search
            name, email, or phone.
          </p>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> holds manage;{" "}
            <strong className="text-foreground">event_coordinator</strong> and{" "}
            <strong className="text-foreground">finance</strong> hold view-only;{" "}
            <strong className="text-foreground">board</strong> and{" "}
            <strong className="text-foreground">volunteer</strong> have no
            access to this page.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            Other modules link back here — a named{" "}
            <Link
              href="/portal/inventory/donations"
              className="underline hover:text-foreground"
            >
              donation
            </Link>
            &apos;s donor, or a{" "}
            <Link
              href="/portal/governance/resolutions"
              className="underline hover:text-foreground"
            >
              resolution
            </Link>
            &apos;s mover and seconder, are all People records.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <p>
            Confusing this with{" "}
            <Link
              href="/portal/administration/users"
              className="underline hover:text-foreground"
            >
              Administration &gt; Users
            </Link>{" "}
            — People is a contact directory with no bearing on portal access;
            adding someone here doesn&apos;t give them a login, and giving
            someone a login doesn&apos;t add them here.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/communications": {
    title: "How message triage works",
    description: "The status lifecycle for contact-form submissions.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">new → read → resolved</strong>{" "}
              is the expected path, but nothing enforces the order — status can
              be set directly to any value.
            </li>
            <li>
              Opening a <code>new</code> message&apos;s details automatically
              marks it <code>read</code>.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> — no other
            role has any access to Communications, not even view.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            Nothing — this is purely internal triage bookkeeping. Changing the
            status doesn&apos;t send a reply or notify the submitter.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <p>
            Opening a message just to skim it moves it out of <code>new</code>{" "}
            automatically — if you&apos;re relying on that filter to track
            what&apos;s unread, browsing a message clears it.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/events": {
    title: "How status, visibility, and the section rail work",
    description:
      "The event lifecycle, public-site visibility, and the outstanding-work counts in the event's section list.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Status</strong> tracks where
              an event is in its lifecycle: draft → published, or
              cancelled/archived along the way. There is no status to set once
              an event is over: its dates mark it Upcoming, Today or Past, and a
              past published event stays on the public site.
            </li>
            <li>
              <strong className="text-foreground">Visibility</strong> controls
              whether an event can appear on the public site.
            </li>
            <li>Both are set independently from the event editor.</li>
            <li>
              <strong className="text-foreground">The section rail</strong> down
              the left of an event lists everything the event holds at once,
              grouped under Overview, Planning, During and After. Those are
              headings, not steps — you can open any section from any other, so
              correcting something on Planning weeks after the event is one
              click. Search the rail if you are not sure which section holds
              what: it matches on more than the section&apos;s name, so
              &ldquo;budget&rdquo; finds Registration &amp; planning and
              &ldquo;raffle&rdquo; finds Giveaway.
            </li>
            <li>
              <strong className="text-foreground">The counts</strong> beside a
              section say what is still outstanding in it, worked out from the
              event&apos;s own data rather than set by hand. Hover a count to
              see what is missing. No badge means nothing is outstanding.
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  <strong className="text-foreground">Checklist</strong> counts
                  unfinished checklist items.
                </li>
                <li>
                  <strong className="text-foreground">
                    Registration &amp; planning
                  </strong>{" "}
                  counts planning as incomplete until a lead, capacity and
                  budget are all filled in — and stops asking once the event has
                  started.
                </li>
                <li>
                  <strong className="text-foreground">Attendance</strong> asks
                  for a headcount once the start time has passed.
                </li>
                <li>
                  <strong className="text-foreground">Results</strong> asks for
                  the after-report and the retro, until the report is submitted,
                  and counts open retro action items.
                </li>
              </ul>
            </li>
            <li>
              <strong className="text-foreground">The Results card</strong>{" "}
              summarizes the event from its own records, so no figure is ever
              typed. Outcomes comes first: participation, people served,
              assistance given and discount codes, including the discount value
              the codes offered. Then money, goods, sponsors, team and
              incidents, then the written parts — participant feedback, photos,
              impact notes and the retro. Each figure links to the card it comes
              from. You only see the sections your role can read: Money needs
              access to financial reports, and its net is income less what has
              been paid out, counted the same way as Finance → Reports.
              Submitting the report locks the whole card until it is reopened,
              and freezes its money, goods, sponsors, team and incident figures
              as they stood. A late expense or a voided sale after that
              doesn&apos;t move the submitted figures: each one that has changed
              since says what it is now. Reopening drops the frozen figures.
            </li>
            <li>
              <strong className="text-foreground">
                The Discount codes card
              </strong>{" "}
              holds a partner&apos;s single-use codes, each given to one
              registrant, and at most one shared code for everyone who
              registers, which goes out in every registration confirmation
              email. Paste single-use codes one per line, with the
              partner&apos;s PIN after a comma where there is one; the PIN is
              shown and emailed with its code. Say which registration options a
              code covers and by what percentage, and with each option&apos;s
              price from the Planning tab the Results card works out the
              discount value it offered. That is what the codes were worth, not
              whether anyone used them, so it never counts as assistance.
            </li>
            <li>
              <strong className="text-foreground">Cash donations</strong>, in
              the Money group, lists the cash gifts linked to the event, for
              anyone who can read Finance. They are recorded and edited in
              Finance → Donations by choosing the event on the gift.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">event_coordinator</strong>{" "}
            manage events; <strong className="text-foreground">finance</strong>{" "}
            has view-only access for expense and sponsor reconciliation;
            volunteers can view and sign up; board has no access to this page.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              These two fields are independent — a public event still won&apos;t
              show on the public site while it&apos;s draft, and a published
              event marked private stays portal-only.
            </li>
            <li>
              Event edits are not yet written to the audit log (unlike expenses,
              calendar items, and most other portal records).
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Publishing an event without also setting Visibility to public —
              the event moves past draft but still won&apos;t show publicly.
            </li>
            <li>
              Forgetting to mark a past event Completed leaves it showing as
              upcoming in reports that key off status.
            </li>
            <li>
              Expecting the outstanding counts to follow the event Status field
              — they don&apos;t. A cancelled or archived event&apos;s sections
              keep computing from its own data.
            </li>
            <li>
              Looking for a box to type a result into. Every figure is counted
              from where the work was recorded: first time on snow from the
              rider level, rental subsidies from rental discount codes,
              assistance from code values, items given out and expenses marked
              participant assistance. If a figure looks low, fix the record it
              comes from. The same goes for a giveaway: tickets sold and revenue
              are counted from the sales recorded under Ticket packages.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
};
