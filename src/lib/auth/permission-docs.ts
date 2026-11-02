/**
 * What each permission resource actually grants, in the words an administrator
 * granting it would use (#1324).
 *
 * The database catalog (`public.resources`, seeded across the migrations) stays
 * the source of truth for *which* resources exist, their section, their
 * sort order and the one-line `description` printed under a label in the
 * permissions matrix. That line has to fit inside a table cell, so it names the
 * subject area and stops -- it cannot say what changes when a cell moves from
 * None to View to Manage, and it cannot say which adjacent resource covers the
 * thing this one does not. Those are what this module adds.
 *
 * Prose in code rather than a second migration-seeded column, for two reasons:
 * it is reviewed in the pull request that changes the behaviour it describes,
 * and `permission-docs.test.ts` can then hold it to the checks that actually
 * exist on disk. `docs/permissions.md` is the written half of the same rule.
 *
 * Deliberately free of server-only imports: the permissions matrix and the
 * reference page are both client components.
 */

export type PermissionExclusion = {
  /** The adjacent resource that does cover it. */
  key: string;
  /** What that other resource covers, phrased as the thing this one lacks. */
  covers: string;
};

export type PermissionDoc = {
  /**
   * What View allows, in plain task language -- not a restatement of the
   * label.
   *
   * `null` means no check anywhere asks for this resource at View, so granting
   * View behaves exactly like None. That is a real answer an administrator
   * needs, and `permission-docs.test.ts` holds it to the checks on disk in
   * both directions: a documented level must be checked somewhere, and a
   * checked level must be documented.
   */
  view: string | null;
  /** What Manage adds on top of View. `null` has the same meaning as above. */
  manage: string | null;
  /**
   * Adjacent resources whose names are close enough to this one that the split
   * is invisible until somebody is refused. This is the field the ticket was
   * opened over.
   */
  excludes?: readonly PermissionExclusion[];
  /** Anything else to know before granting it: carve-outs, inert grants. */
  notes?: readonly string[];
};

/**
 * Keyed by `resources.key`. Every resource any migration seeds needs an entry
 * here; adding a resource without one fails `bun run test`.
 */
export const PERMISSION_DOCS: Record<string, PermissionDoc> = {
  // ---------------------------------------------------------------- Events
  events: {
    view: "Open the Events section and read an event's details, schedule, sponsors, giveaway, attendance, logistics and volunteer sign-ups, including which registrations said their party includes someone under 18, each registration's answers to the event's registration questions, and whether it has been asked for or has given answers by emailed link. Also the event's retro on its Results card, and the open action items carried forward from earlier events in the same program on its Checklist card. Someone at this level who is also on the event's staff roster adds to its retro, edits and removes their own items, and marks their own action items done. Also the photos and videos on an event's Media card, viewed, played and downloaded (one at a time or the photos as a .zip) through short-lived links, with who uploaded each, how much storage the event's and the organization's media take up, and how many of the event's registrants objected to being photographed; someone on the event's staff roster uploads them too, while the organization has Event media uploads on. Also which of those photos and videos show in the event's public gallery, and the gallery's link to copy. Also what the Calendar reads to show events alongside calendar items. Also an event's Carpools section, where it organizes carpools: each car's driver, seats, leaving-from and notes, its passengers, and which of them have paid their driver, with who marked it and when -- and the Carpool column and line on its registrants.",
    manage:
      "Create and edit events and everything filed on one: staff and volunteer assignments, shifts, registrants and their messages, cancelling a registration and undoing it, the questions registration asks (including copying them from another event), discount codes, sponsors, giveaway tiers and logistics. That includes an event's shared discount code and the partner PINs that go with codes — readable, like the codes themselves, at Events view — and the percentage off each registration option a code covers, and the options' prices on the Planning tab. Also the accompanying adult and emergency contact a party with someone under 18 gives — those four are readable at this level and no lower, in the database as well as on screen — and whether public registration asks about under-18s at all, from the Registration button on the Events page. Also an event's registration questions, editing a registration's answers to them, and the registrants tab's Download answers (CSV), which carries a registrant's email and phone only where they ticked the event's consent question for sharing them, and their Instagram handle on every row. Also emailing registrants a link to fill in missing answers (Ask for missing answers, and Ask for answers on one registrant), which works without an account for that one registration's answers until the event ends. Also uploading an event's flier to the site's photos. Also adding to any event's retro without being on its staff roster, and editing, removing or closing anyone's retro item. Also uploading photos and videos to any event's Media card without being on its staff roster, and deleting them from it, and turning the organization's Event media uploads on or off from the Media button on the Events page. Also showing or hiding each photo and video in the event's public gallery on its Media card -- photos are public as they are uploaded and videos are not -- and turning the organization's Public event gallery on or off from the same Media button. Also creating, listing and revoking an event's upload links on its Media card, each of which lets whoever holds it upload photos and videos to that one event without an account until it expires or is revoked. Also turning Organize carpools on or off on an event's Planning section and choosing the question seats come from, and on its Carpools section adding, editing and deleting cars, putting registrants in them and moving them between cars, ticking whether each passenger has paid their driver (no amount is stored), and Download carpools (CSV), which carries email, phone and the preferred contact detail under the same consent rule as Download answers. Also submitting an event's report, which freezes the Money, Goods, Sponsors, Team and Operations figures on its Results card as they stand -- all of them, including sections the submitter cannot read, which stay hidden from them. Also reading an event's Access card: who outside the organization's roles has been given access to it, at what level and in which areas, and who gave it -- but not changing it, which is Administration at Manage.",
    notes: [
      "A registrant cancels their own registration from their account or the event page with no grant at all, until the event starts. That path reaches only their own registration and records the reason as can't attend; staff cancel, with a reason, and undo from the Registrants tab at Manage.",
      "Anyone on the public site, with no grant, sees a public, published event's public photos and videos while the organization's Public event gallery is on -- never who uploaded them, their filenames or anything about a hidden one.",
      "A per-event access grant (Administration: Manage gives one) reaches the same things on one event without this permission, but only in the areas it names -- Details & logistics, Staff, Registrations, Media, Impact & retro, and the sensitive Expenses, Revenue, Sponsors & pricing, Giveaway & goods and Incidents once the organization offers them -- at View or Manage. It never creates or deletes an event, writes to the donation, sales or inventory ledgers, changes an organization-wide setting, reads an event's report, or emails registrants on the organization's behalf (messages, reminders, answer requests, carpool assignments).",
      "Someone holding grants and no role is a guest in the portal: they see Events alone, listing only their granted events, and on each one only the cards its areas cover, editable only on a Manage grant.",
      "A grant does not open People. Its holder sees the names of the people on its event's rows in the areas it covers -- staff, volunteers, sponsors, prize donors, the lead, owners -- with the email and phone those cards already show, and nothing else of their records. Their pickers offer only people already on the event, and they cannot create a person.",
    ],
    excludes: [
      {
        key: "event_expenses",
        covers: "the money an event spends",
      },
      { key: "event_revenue", covers: "the money an event takes in" },
      {
        key: "event_incidents",
        covers: "incident and problem reports, which are deliberately narrower",
      },
      {
        key: "event_impact",
        covers:
          "the assistance and discount-code figures on an event's Results card, and its impact notes",
      },
      {
        key: "event_volunteer_hours",
        covers: "hours logged against the event",
      },
      {
        key: "artwork_submissions",
        covers: "calls for community artwork and the submissions to them",
      },
    ],
  },
  event_expenses: {
    view: "See an event's expenses on its Expenses tab, and the expense figures the dashboard totals. Also what opens an uploaded expense receipt: the private file is signed only for someone who can see the expense it belongs to.",
    manage:
      "Record and edit expenses against an event from Finance → Expenses and from the event itself, including uploading a receipt or a photo of one.",
    excludes: [
      {
        key: "finance_approvals",
        covers: "approving, rejecting or marking paid what has been submitted",
      },
      {
        key: "finance",
        covers: "the Finance section's own donation and expense ledgers",
      },
    ],
    notes: [
      "This is the resource an event coordinator needs to book event spend without any access to Finance at large.",
    ],
  },
  event_incidents: {
    view: "Read the incident and problem reports filed against an event.",
    manage: "File, edit and close incident reports on an event.",
    notes: [
      "Split out from Events because the content is sensitive: an incident report can name a participant and describe what happened to them. A coordinator who runs the event does not automatically read these.",
    ],
  },
  event_volunteer_hours: {
    view: "Read the hours logged against an event by anyone.",
    manage: "Log, correct and remove hours against an event for anyone.",
    excludes: [
      {
        key: "volunteer_hours_logging",
        covers: "logging your own hours without touching anyone else's",
      },
      {
        key: "volunteers",
        covers: "the volunteer roster, role types and applications",
      },
    ],
  },
  event_revenue: {
    view: "See an event's revenue on its Revenue tab, and the revenue figures the dashboard totals.",
    manage:
      "Record and edit event revenue -- ticket sales, registration fees, merchandise, onsite donations and grants -- from Finance → Revenue.",
    excludes: [
      {
        key: "sales",
        covers: "the merchandise catalog, the register and the sales ledger",
      },
      { key: "finance", covers: "donations and the expense ledger" },
    ],
  },
  event_impact: {
    view: "Read the Outcomes on an event's Results card that go beyond attendance: rental subsidies, participant assistance and its parts (assigned code values, value given out, paid expenses marked participant assistance), assigned discount codes, the discount value the event's shared and single-use codes offered (never part of assistance) and, with the Rider Profile module, beginners and first time on snow. Also the event's impact notes, and any figures typed by hand before they were derived, shown read-only as archived. Every figure is computed from records; nothing at this level is typed. Without Events access the Results card cannot be opened, so this reaches the same figures through the program impact report.",
    manage:
      "Write an event's impact notes on its Results card, until its report is submitted.",
    excludes: [
      {
        key: "programs_reports",
        covers: "the season-wide rollup this data feeds",
      },
    ],
  },
  artwork_submissions: {
    view: "Open the Artwork section: the open calls for community artwork and the submissions that have come in.",
    manage:
      "Create and edit calls, and review, accept, decline and write to submissions, and claim a pending submission, release a claim or assign it to someone else.",
    notes: [
      "Claiming a queue item for yourself and assigning it to someone else are checked separately by set_queue_item_claim(); today both need Manage. A claim clears when the item is resolved (#1668).",
      "Its own resource rather than part of Events because the reviewers are usually a comms or programming group rather than whoever runs the event.",
    ],
  },
  programs: {
    view: "Open the Programs section and read the named, repeatable initiatives that events are tagged to.",
    manage: "Create, rename, retire and re-tag programs.",
    excludes: [
      {
        key: "programs_reports",
        covers: "the impact rollup across a program's events",
      },
    ],
  },
  programs_reports: {
    view: "Open Programs → Reports: the season or program rollup of events, participation, assistance, equipment and volunteer hours.",
    manage: null,
    notes: [
      "A reporting resource, so there is nothing to manage. Granting Manage is the same as granting View.",
    ],
  },

  // ------------------------------------------------------------- Inventory
  inventory: {
    view: "Open the Inventory section: the item catalog, categories, requests, donations and distribution records, an item's history with who recorded each step (the donor is named only to a reader who can also read donations), print the labels of items that already have a tag code, and scan a tag to open its item. On Items → Codes: list, filter and reprint every tag code, mark a code written to an NFC tag, and read a code's history.",
    manage:
      "Edit the item catalog and categories, give items their tag codes, create and assign numbered codes, retire a code whose tag is damaged or lost, or an item's old tag code once it has a numbered code — for one item or a selection on the Items list — and restore a retired code, record, correct and delete donation intake and distribution movements, read the in-kind items donated at an event on its Donations card, and work an open gear request: move it through its statuses, add or remove the items it holds, and edit its notes, and claim it, release a claim or assign it to someone else; and on a fulfilled request, return an item that was not actually handed over to the shelf.",
    notes: [
      "Claiming a queue item for yourself and assigning it to someone else are checked separately by set_queue_item_claim(); today both need Manage. A claim clears when the item is resolved (#1668).",
    ],
    excludes: [
      { key: "inventory_reports", covers: "valuation and reporting" },
      {
        key: "inventory_intake",
        covers:
          "recording intake and distribution without the catalog or the reports",
      },
    ],
  },
  inventory_reports: {
    view: "Open Inventory → Reports, see the inventory valuation figures on the dashboard and on an event, and read an event's Distributions and Donations cards -- the stock that went out and the in-kind items that came in, with no monetary gifts.",
    manage: null,
    notes: [
      "A reporting resource, so there is nothing to manage. Granting Manage is the same as granting View.",
    ],
  },
  inventory_intake: {
    view: "Read the inventory category vocabulary, so the intake and distribution pickers have labels in them. Nothing else.",
    manage:
      "Record donation intake and distribution movements, including their photos, from the dashboard's quick actions and from the Inventory → Donations and → Distribution pages -- without any access to the item catalog or the reports. Intake tags what it receives: each item gets a code, a pre-printed blank label or a manufacturer barcode can be scanned onto it (a known barcode fills in the name and category of an item already carrying it), and the received items' labels, or a batch of blank labels, print from Inventory → Donations.",
    excludes: [
      {
        key: "inventory",
        covers: "the item catalog, categories and requests",
      },
      { key: "inventory_reports", covers: "valuation and reporting" },
    ],
    notes: [
      "A Workflow carve-out: the narrow grant for whoever works the intake table at an event. View alone is not usable -- it only keeps the category labels visible -- so this is a resource to grant at Manage or not at all.",
    ],
  },

  // --------------------------------------------------------------- Finance
  finance: {
    view: "Open the Finance section and see its landing figures, read the in-kind items donated at an event on its Donations card, and read the cash gifts linked to an event on its Cash donations card. Enough to reach the section, not to work the ledger: Finance → Donations itself takes Manage.",
    manage:
      "Work the donation ledger, the expense ledger and event revenue: record, edit and delete entries, record a donation from the dashboard's quick actions (tagging its items as intake does), import a giving provider's CSV export into the donation ledger, and set the giving path the public site points at — which giving page it opens, and the amounts it offers.",
    excludes: [
      {
        key: "finance_approvals",
        covers: "approving, rejecting or marking paid a submitted expense",
      },
      {
        key: "finance_reports",
        covers: "the financial reports and oversight pages",
      },
      { key: "event_expenses", covers: "expenses booked against an event" },
      { key: "event_revenue", covers: "revenue booked against an event" },
      {
        key: "reimbursements",
        covers: "personal-spend reimbursement requests",
      },
      {
        key: "sales",
        covers: "merchandise, the register and the sales ledger",
      },
    ],
    notes: [
      "The name is wider than the grant. Six adjacent resources carve pieces out of it, and this is the split that most often surprises an administrator.",
      "It is also the gate on the giving path (#1389), which is configured in Finance > Donations rather than in Administration because it shapes one feature. Nothing about it moves money: the setting is the address of the page your provider hosts, and your organization is the one being paid.",
    ],
  },
  finance_reports: {
    view: "Open Finance → Reports, and read the financial figures a board member is shown on the dashboard and in a meeting's context pack, and the Money section of an event's Results card.",
    manage: null,
    notes: [
      "The board's resource: it reads the reports without reaching a ledger. A reporting resource, so Manage is the same as View.",
      "The event Results card's Money section (income by stream, paid and committed spend, net, budget) is computed from the same definitions as Finance → Reports, so the two agree; without this grant the section is hidden rather than shown as zeros.",
    ],
  },
  finance_approvals: {
    view: null,
    manage:
      "Approve, reject or mark paid any submitted expense, and see the approval queue in the attention bell.",
    excludes: [
      { key: "finance", covers: "recording and editing the expenses" },
      {
        key: "reimbursement_approvals",
        covers: "the same decisions on reimbursement requests",
      },
    ],
    notes: [
      "The database refuses an approval by the person who submitted it, whatever this grant says. Self-approve own expenses is the narrow exception.",
    ],
  },
  finance_self_approval: {
    view: null,
    manage:
      "Approve your own routine, below-threshold expense submissions, which Expense approvals alone would refuse.",
    excludes: [
      {
        key: "finance_approvals",
        covers: "approving anybody else's submissions",
      },
    ],
    notes: [
      "A Workflow carve-out, and the narrowest grant in the catalog: it widens nothing except the self-approval rule, and only under the org-wide approval threshold in Organization Settings.",
    ],
  },
  reimbursements: {
    view: "See reimbursement figures in the dashboard and in a meeting's context pack.",
    manage:
      "Open Finance → Reimbursements and submit, edit and withdraw reimbursement requests, including uploading a receipt or a photo of one. An uploaded receipt opens for whoever can see the request.",
    excludes: [
      {
        key: "reimbursement_approvals",
        covers: "deciding on a submitted request",
      },
      { key: "finance", covers: "the donation and expense ledgers" },
    ],
    notes: [
      "Reimbursements is a module of its own. A tenant that was not sold it will not see this row at all.",
    ],
  },
  reimbursement_approvals: {
    view: null,
    manage:
      "Approve, reject or mark paid any submitted reimbursement, see the queue in the attention bell, and open the receipt attached to a request.",
    excludes: [
      { key: "reimbursements", covers: "submitting and editing the requests" },
      {
        key: "finance_approvals",
        covers: "the same decisions on expense submissions",
      },
    ],
    notes: [
      "The database refuses an approval by the person who submitted it. Self-approve own reimbursements is the narrow exception.",
    ],
  },
  reimbursement_self_approval: {
    view: null,
    manage:
      "Approve your own routine, below-threshold reimbursement requests, which Reimbursement approvals alone would refuse.",
    excludes: [
      {
        key: "reimbursement_approvals",
        covers: "approving anybody else's requests",
      },
    ],
    notes: [
      "A Workflow carve-out, the reimbursement twin of Self-approve own expenses, bounded by the same org-wide threshold.",
    ],
  },
  sales: {
    view: "Open Finance → Sales and read the sales ledger, the product catalog and an event's sales figures.",
    manage:
      "Edit the product catalog, take payments on the register, and record, correct and void sales.",
    excludes: [
      { key: "event_revenue", covers: "revenue booked directly on an event" },
      { key: "finance", covers: "donations and the expense ledger" },
    ],
    notes: [
      "Sales belongs to the Finance module, so it disappears from this matrix when Finance is off.",
    ],
  },

  // ---------------------------------------------------------------- People
  people: {
    view: "Open the People directory and its segments, and search people from the command palette.",
    manage:
      "Create, edit, merge and delete people, work the duplicate queue, manage a person's organization memberships, and list them on the public team page with a photo uploaded to the site's photos (or upload an organization's sponsor logo there).",
    excludes: [
      {
        key: "people_intake",
        covers: "creating a person inline without the directory",
      },
      { key: "constituent_claims", covers: "the website-account claim queue" },
      {
        key: "volunteers",
        covers: "volunteer roles, applications and participation",
      },
    ],
  },
  person_answers: {
    view: "See the organization's profile questions and people's answers to them, wherever the surrounding screen is already open to you, including an event's Profile answers card (counts per answer, which also needs Events at View or Event impact at View).",
    manage:
      "Create, edit, reorder, scope and archive the profile questions at People › Profile questions, define the figures counted from them (like \"Beginner participants\"), and edit a person's answers: on the person form (which also needs People at Manage) and at the door from an event's registrants (which also needs Events at Manage).",
    excludes: [
      { key: "people", covers: "the rest of a person's record" },
      {
        key: "events",
        covers: "the questions one event asks at registration",
      },
    ],
    notes: [
      "One permission for every question; there is no per-question restriction yet.",
      "The figures defined from answers show on the Results card and the Program Impact Report under Event impact or Program reports alone: a count is not an answer.",
      "In an event's registrants -- the Profile column, the registrant sheet and the answers export -- answers show only alongside Events at Manage; Events at View (a door shift reading a party size) does not see them.",
      "Belongs to the Profile questions module, which is on for every organization. An organization with no questions asks nobody anything.",
      "Seeded from each role's Rider profiles access, which it replaced (#1746), so nobody's access changed when it arrived.",
      "Deleting a person's answers on request is not gated on this: it stays with People or Events at Manage, so a deletion request can always be honoured.",
      "A person answering on their own (after registering for an event, or on their details page) needs no permission: those paths check the registration or the signed-in account instead.",
    ],
  },
  people_intake: {
    view: null,
    manage:
      "Create a person inline from an event, donation or intake form, and read back the record you just collided with -- without opening the People directory.",
    excludes: [
      {
        key: "people",
        covers: "the directory itself, editing, merging and deleting",
      },
    ],
    notes: ["A Workflow carve-out for whoever takes names at a table."],
  },
  constituent_claims: {
    view: "See the queue of website accounts asking to be linked to a person in the directory, on People → Claims and on the Users page.",
    manage:
      "Approve or reject a claim, link or unlink an account by hand, and claim a pending account claim for yourself, release it or assign it to someone else.",
    excludes: [
      { key: "people", covers: "the directory the claim points into" },
      { key: "administration", covers: "portal user accounts and their roles" },
    ],
    notes: [
      "Claiming a queue item for yourself and assigning it to someone else are checked separately by set_queue_item_claim(); today both need Manage. A claim clears when the item is resolved (#1668).",
      "Belongs to the Constituent Accounts module. It is seeded to the Admin role only, on purpose -- widen it once somebody other than an administrator is actually working the queue.",
    ],
  },

  // ------------------------------------------------------------ Volunteers
  volunteers: {
    view: "Open the Volunteers section: role types, applications and participation.",
    manage:
      "Edit volunteer role types, decide on applications, record participation for anyone, and claim an open application or self-logged hours, release a claim or assign it to someone else.",
    notes: [
      "Claiming a queue item for yourself and assigning it to someone else are checked separately by set_queue_item_claim(); today both need Manage. A claim clears when the item is resolved (#1668).",
    ],
    excludes: [
      {
        key: "volunteer_hours_logging",
        covers: "logging your own hours and nobody else's",
      },
      {
        key: "event_volunteer_hours",
        covers: "hours as they are logged against an event",
      },
      {
        key: "volunteer_screening",
        covers:
          "whether somebody has been cleared for a screening level, which is granted separately and deliberately narrower",
      },
      { key: "people", covers: "the underlying contact records" },
    ],
  },
  volunteer_screening: {
    view: "Open Volunteers > Screening levels, and see the screening outcomes recorded against a person on their profile and on a volunteer application.",
    manage:
      "Name the screening levels this organization recognises, and record or remove the outcome of a screening against a person.",
    excludes: [
      {
        key: "volunteers",
        covers:
          "role types, applications and everyone's participation -- none of which this one grants",
      },
      {
        key: "people",
        covers: "the contact record an outcome is filed against",
      },
    ],
    notes: [
      "Seeded to Administrator alone, and deliberately not mirroring Volunteers: a coordinator or a volunteer holds Volunteers at View and has no reason to see who has been screened.",
      "The portal stores the outcome and nothing else -- a level and a date. It has nowhere to put a check, a result, a reference or a note, by design rather than by policy.",
    ],
  },
  volunteer_hours_logging: {
    view: null,
    manage:
      "Log your own hours against an event, from the dashboard's quick actions or the participation page, without being able to edit anyone else's entries.",
    excludes: [
      {
        key: "volunteers",
        covers: "role types, applications and everyone's participation",
      },
      { key: "event_volunteer_hours", covers: "correcting anyone's hours" },
    ],
    notes: ["A Workflow carve-out: the grant a volunteer holds."],
  },

  // ------------------------------------------------------------ Governance
  governance: {
    view: "Read governance records where a page offers them: meeting agendas and the approved minutes, and the governance figures on the dashboard. Also what opens a document uploaded to a governance record: the private file is signed only for someone holding at least View in the same organization.",
    manage:
      "Open the Governance section and work all of it -- board members, meetings, agendas, minutes, decisions and action items, resolutions, bylaws, policies, conflict-of-interest disclosures, grants, partnerships, annual requirements and nonprofit status.",
    excludes: [
      {
        key: "finance_reports",
        covers: "the financial figures a meeting's context pack pulls in",
      },
    ],
    notes: [
      "The section's own gate asks for Manage, so View is the reader's grant for agendas and approved minutes rather than a way into the section.",
      "Does not reach conduct reports. Administering board records and reading a report that may name a board member are deliberately different grants.",
    ],
  },

  // --------------------------------------------------------------------- Conduct
  //
  // The one resource in the catalog whose two levels are not the same job at
  // two widths. View is a reviewer's ticket and shows nothing on its own; the
  // rows it reaches are decided by assignment, in the database.
  conduct_reports: {
    view: "Open Conduct and read the reports you have been assigned to review or hear an appeal on, and step back from one with a reason. On its own it shows nothing: a person holding View and no assignment sees an empty queue, which is the intended state rather than a fault.",
    manage:
      "Hold intake. Record a report however it arrived, read every report in the organization, assign and unassign reviewers for the review and the appeal, record the acknowledgement, interim and final actions, the decision, the outcome and the appeal, and close or reopen a case.",
    excludes: [
      {
        key: "governance",
        covers:
          "board records, meetings and policies -- including the code of conduct's own text, which is edited in Website",
      },
      {
        key: "event_incidents",
        covers:
          "what went wrong at an event, which is a different record from a report about somebody's behaviour",
      },
      {
        key: "people",
        covers: "the contact records a report may name",
      },
      {
        key: "administration",
        covers:
          "the audit log, which lists changes to conduct records without their narrative -- every line of one is stripped before it is written",
      },
    ],
    notes: [
      "Seeded to Administrator alone, including for Board. Whose job it is to review a report is a decision each organization makes, and a report may name the person it would otherwise be granted to by default.",
      "Assignment is the access grant, so granting View is what makes somebody assignable: the database refuses an assignment to anybody who does not hold it, rather than accepting one that would show them nothing.",
      "Recusal removes the case from the reviewer's view, not just their vote. A recused reviewer keeps neither.",
    ],
  },

  // ------------------------------------------------- Content & Community Calendar
  content_calendar: {
    view: "Open the Calendar and read its items, categories and the events shown beside them.",
    manage:
      "Create and edit calendar items, run recurrence and the importer, manage categories, and work content opportunities.",
    excludes: [{ key: "events", covers: "the events the calendar displays" }],
  },

  // -------------------------------------------------------- Communications
  communications: {
    view: "Open the Messages section and read what the public contact form has sent in.",
    manage:
      "Reply to a message, change its status, and claim it, release a claim or assign it to someone else.",
    notes: [
      "Claiming a queue item for yourself and assigning it to someone else are checked separately by set_queue_item_claim(); today both need Manage. A claim clears when the item is resolved (#1668).",
    ],
    excludes: [
      {
        key: "system_settings",
        covers: "the automatic replies and the sender identity behind them",
      },
    ],
  },

  // -------------------------------------------------------- Administration
  administration: {
    view: "Almost nothing on its own. One database policy admits it; every page filed under Administration asks for Manage.",
    manage:
      "Open Administration: users and their roles, the roles and the permissions matrix itself, the audit log, the email delivery log, data retention, and the organization export. Also the only grant that gives, changes or removes a guest's per-event access (an event's Access card) and chooses which event areas those grants may offer (Roles > Event access). Also gates Technology and some person-record administration.",
    excludes: [
      {
        key: "system_settings",
        covers: "the org-wide settings and automatic replies pages",
      },
      { key: "site_content", covers: "the public website's copy" },
      { key: "platform_tenants", covers: "administering other organizations" },
      {
        key: "access_management_assets",
        covers: "the technology asset registry on its own",
      },
    ],
    notes: [
      "This is the grant that lets somebody change everybody else's access, including their own. Treat it as the most consequential row in the matrix.",
    ],
  },
  system_settings: {
    view: null,
    manage:
      "Edit org-wide configuration -- the expense approval threshold, organization identity, branding (including uploading its logo and app icon to the site's photos), notification settings, automatic replies -- and the Website section's own settings: layout, page visibility and legal documents.",
    excludes: [
      { key: "administration", covers: "users, roles and the audit log" },
      { key: "site_content", covers: "the copy on the public website" },
    ],
    notes: [
      "The board's other grant: it reaches Organization Settings without the Administration permission.",
    ],
  },
  site_content: {
    view: "Open the Website section and read its pages, articles and content packs.",
    manage:
      "Edit the copy on the public website: page headings, introductions, team bios, legal documents and the articles.",
    excludes: [
      {
        key: "system_settings",
        covers: "page layout, page visibility and legal-document settings",
      },
      {
        key: "platform_tenants",
        covers: "the cross-tenant content packs on the same pages",
      },
    ],
  },
  publications: {
    view: "Open Publications and read every issue, drafts included, with its pages, transcripts and files.",
    manage:
      "Create and edit issues, upload their pages, PDFs and cover, write alt text and transcripts, and publish or unpublish an issue.",
    excludes: [
      {
        key: "site_content",
        covers: "the rest of the copy on the public website",
      },
      {
        key: "system_settings",
        covers: "whether the publications section is shown on the public site",
      },
    ],
    notes: [
      "Belongs to the Publications module. Seeded from each role's Public site content access, so whoever edits the website edits its issues.",
      "An issue cannot be published until every page has alt text and a transcript, and its web address cannot change once it has been published.",
    ],
  },
  access_management_assets: {
    view: "Open Technology and read the registry of external services, assets and access grants.",
    manage: "Add, edit and retire assets, services and access grants.",
    excludes: [
      {
        key: "access_management_reviews",
        covers: "recording a periodic access review",
      },
    ],
    notes: [
      "A registry of what exists and who has it, not a credential store. Nothing here holds a password.",
    ],
  },
  access_management_reviews: {
    view: "Reach the Technology section to see the review history on an asset.",
    manage:
      "Record a periodic access review on an asset without holding asset-management rights.",
    excludes: [
      {
        key: "access_management_assets",
        covers: "editing the assets themselves",
      },
    ],
  },
  platform_tenants: {
    view: null,
    manage:
      "Open the Platform section and provision and administer the organizations on the platform -- custom domains, module entitlements, exports -- plus the cross-tenant content packs under Website.",
    notes: [
      "Inert outside the platform's own tenant. The grant exists on every tenant's Admin role, and the permission resolver reports it as None unless the reader is a platform operator, so granting it here changes nothing for this organization.",
    ],
  },
};

/** Every resource key this module documents. */
export function documentedResourceKeys(): string[] {
  return Object.keys(PERMISSION_DOCS);
}

export function permissionDocFor(key: string): PermissionDoc | undefined {
  return PERMISSION_DOCS[key];
}

/**
 * The sentence the UI shows for a level with no prose, so "View does nothing
 * here" is stated rather than left as an empty panel.
 */
export const LEVEL_HAS_NO_EFFECT =
  "Nothing on its own — no check in the product asks for this resource at this level, so it behaves like None.";
