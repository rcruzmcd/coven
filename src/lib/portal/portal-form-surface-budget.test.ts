// Every portal form reaches a phone as a sheet (#1115).
//
// `PortalFormSurface` is what does it, and it works -- a form that used to be
// a centred box with dead space above and below is now full height, header
// pinned, footer above the safe-area inset, body the only scroller. The
// problem was never the capability, it was adoption: the primitive landed in
// #1132 with two pilots and roughly seventy dialogs behind it. Fifty forms
// migrated by hand is worth less than the rule that catches the fifty-first,
// which is what this is.
//
// Like table-column-budget.test.ts and nav-guards.test.ts, it reads the source
// on disk rather than a constant: there is nothing to import that would tell
// you which composition a file chose.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const APP_ROOT = join(import.meta.dir, "../../app/portal/(app)");

/**
 * Dialogs that stay centred on both devices, each with the reason.
 *
 * The list is the point as much as the rule. A picker, a diff review or a
 * print preview should say once, in code, that it has been looked at and is
 * not a form -- otherwise it is indistinguishable from the ones nobody has
 * looked at yet. A stale entry fails too: an exemption that is no longer
 * needed is a claim about the dialog that has stopped being true.
 *
 * Nothing here may wrap a `<form>`. An exemption is a statement that the
 * dialog is not a form, not a way to keep a form off the surface -- the test
 * below enforces that, so the only way to exempt a real form is to lie in a
 * way the rule catches.
 */
const EXEMPT: Record<string, string> = {
  // Not forms: a decision, a diff, a preview, a carousel.
  "administration/roles/permissions-matrix.tsx":
    "The confirmation in front of Save permission changes. It restates the " +
    "grants about to change; there is nothing to type.",
  "administration/users/pending-access-section.tsx":
    "Shows a minted invite link to copy. Read-only, and the only control is " +
    "Copy.",
  "events/event-reminder-settings.tsx":
    "Preview reminder (#1652): the event reminder rendered for a made-up " +
    "registrant, read-only. It opens from inside the Planning tab's own " +
    "form, so a <form> of its own would submit the tab's.",
  "events/media-video-list.tsx":
    "Plays one of an event's videos (#1607): a player, not a form. The only " +
    "controls are the video's own.",
  "events/registration-questions-editor.tsx":
    "Copy from another event (#1501): picks a source event and drops its " +
    "questions into the Planning tab's own unsaved form. Nothing is " +
    "submitted from here; a <form> of its own would submit the tab's.",
  "governance/meetings/meeting-export-dialog.tsx":
    "The agenda's or the minutes' print preview. It renders the export's own " +
    "Markdown with copy and print buttons -- a document, not an editor.",
  "governance/meetings/minutes-approval-dialog.tsx":
    "The previous meeting's minutes, read, then approved with one action. " +
    "The approval is a button, not a field.",
  "inventory/items/[itemId]/numbered-code-buttons.tsx":
    "Assign numbered code (#1444): the same scanner as Scan a tag. Each scan " +
    "or typed code is tried at once, and a code another item holds is a " +
    "yes/no question; there is nothing to fill in and no submit.",
  "inventory/items/bulk-assign-codes.tsx":
    "Assign numbered codes to a selection (#1542): the same scanner, one " +
    "item at a time. Each scan or typed code is tried at once, a code " +
    "another item holds is a yes/no question, and Skip moves on; there is " +
    "nothing to fill in and no submit.",
  "inventory/requests/[requestId]/add-request-item-dialog.tsx":
    "Add an item to a gear request (#1527): a search-and-pick list. Each " +
    "row's Add applies at once; there is nothing to fill in and no submit.",
  "inventory/items/scan-tag-dialog.tsx":
    "Scan a tag (#1420): a scanner, not a form. Each scan looks the tag up " +
    "and opens the item; there is nothing to fill in and no submit.",
  "people/[id]/merge-dialog.tsx":
    "Picks the other half of a merge and opens the review. The review " +
    "itself is a route, and this dialog collects no values of its own.",
  "platform/tenant-modules-dialog.tsx":
    "Says what turning a module off does to somebody else's portal before " +
    "the operator does it. Toggles apply on click; there is no submit.",
  "social/[pieceId]/social-post-featured-gear-card.tsx":
    "Choose item (#1841): a search-and-pick list of Gear Library items. A " +
    "row's click swaps the post's item at once; there is nothing to fill in " +
    "and no submit.",
  "website/publish-changes-dialog.tsx":
    "The diff review before publishing. Each change is accepted or reverted " +
    "on its own, so a submit button would have nothing to mean.",
  "welcome/step-dialog.tsx":
    "The onboarding and release-note carousel. Steps and a dismissal, no " +
    "input at all.",
};

/**
 * Source with every string, template literal and comment replaced by spaces,
 * offsets preserved.
 *
 * A dialog's own prose mentions `<form>` and `DialogContent` often enough --
 * this file's exemption reasons would match themselves -- and a commented-out
 * composition is not a composition. Blanking rather than deleting keeps every
 * index usable against the original text.
 */
function blankLiterals(source: string): string {
  const out = source.split("");
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      while (i < stop) {
        if (source[i] !== "\n") out[i] = " ";
        i++;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      out[i] = " ";
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          out[i] = " ";
          if (i + 1 < source.length) out[i + 1] = " ";
          i += 2;
          continue;
        }
        if (source[i] === char) {
          out[i] = " ";
          i++;
          break;
        }
        if (source[i] !== "\n") out[i] = " ";
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

function portalTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return portalTsxFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

/**
 * The body of each `<DialogContent>` in one file.
 *
 * `<AlertDialogContent>` is deliberately not matched: a destructive confirm
 * stays centred on both devices, which #1115 settled once rather than per
 * call site. The substring `<DialogContent` does not occur inside
 * `<AlertDialogContent`, so the tag name alone is enough to tell them apart.
 */
function dialogBodies(source: string): string[] {
  const masked = blankLiterals(source);
  const bodies: string[] = [];
  const opening = /<DialogContent\b/g;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(masked))) {
    const close = masked.indexOf("</DialogContent>", match.index);
    if (close === -1) continue;
    bodies.push(masked.slice(match.index, close));
    opening.lastIndex = close;
  }
  return bodies;
}

type PortalDialog = { file: string; bodies: string[] };

/** Every `Dialog` left in the portal, by the path EXEMPT spells it with. */
function portalDialogs(): PortalDialog[] {
  return portalTsxFiles(APP_ROOT).flatMap((path) => {
    const bodies = dialogBodies(readFileSync(path, "utf8"));
    return bodies.length === 0
      ? []
      : [{ file: relative(APP_ROOT, path), bodies }];
  });
}

/** Files rendering a `PortalFormSurface`, by the same path spelling. */
function surfaceCallSites(): string[] {
  return portalTsxFiles(APP_ROOT)
    .filter((path) =>
      blankLiterals(readFileSync(path, "utf8")).includes("<PortalFormSurface"),
    )
    .map((path) => relative(APP_ROOT, path));
}

/** Whether any of a file's dialogs wraps a form of its own. */
function wrapsAForm(dialog: PortalDialog): boolean {
  return dialog.bodies.some((body) => /<form\b/.test(body));
}

describe("portal form surface budget", () => {
  test("the scan finds the forms and the dialogs it is meant to police", () => {
    // Without this the whole file passes vacuously the day the parser stops
    // recognising either composition -- a renamed export would be enough, and
    // "no violations" would read exactly the same as "nothing was scanned".
    const surfaces = surfaceCallSites();
    const dialogs = portalDialogs();

    expect(surfaces.length).toBeGreaterThan(40);
    expect(dialogs.length).toBeGreaterThan(5);
    expect(dialogs.every((dialog) => dialog.bodies.length > 0)).toBe(true);
  });

  test("every Dialog left in the portal is a form on the surface or a listed exception", () => {
    const unaccounted = portalDialogs()
      .filter((dialog) => !(dialog.file in EXEMPT))
      .map((dialog) =>
        wrapsAForm(dialog)
          ? `${dialog.file} is a form dialog on a phone-sized centred box -- render it through PortalFormSurface`
          : `${dialog.file} keeps a Dialog -- migrate it to PortalFormSurface, or exempt it with the reason it is not a form`,
      );

    expect(unaccounted).toEqual([]);
  });

  test("no exemption covers a form dialog", () => {
    // Every exemption above is either "not a form" or "a form whose <form> is
    // in a child component". Both stop being true the moment a `<form>`
    // appears in the file itself, and without this that is the one way to put
    // a form back on a centred box with nobody noticing -- including the day
    // one of the delegated forms is lifted into its call site, which is
    // exactly when it becomes migratable.
    const lying = portalDialogs()
      .filter((dialog) => dialog.file in EXEMPT)
      .filter(wrapsAForm)
      .map(
        (dialog) =>
          `${dialog.file} is exempt from the surface but wraps a <form> of its own -- an exemption is not a way to keep a form centred, so render it through PortalFormSurface`,
      );

    expect(lying).toEqual([]);
  });

  test("every exemption is still earning its place", () => {
    const dialogs = portalDialogs();
    const stale = Object.keys(EXEMPT).filter(
      (file) => !dialogs.some((dialog) => dialog.file === file),
    );

    expect(stale).toEqual([]);
  });
});
