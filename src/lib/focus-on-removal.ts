/**
 * A ref callback for a control that can unmount the moment it succeeds: a
 * row's Delete, Remove or Revoke, or an Approve that gives way to a badge.
 *
 *     <Button ref={keepFocusOnRemoval} onClick={remove}>Remove</Button>
 *
 * When React removes the control while it holds keyboard focus, focus would
 * fall to `<body>` and the next Tab start over at the skip link (#1862,
 * #1863). Instead it goes, in order, to:
 *
 * 1. whatever took the control's place in its table cell (Deactivate becomes
 *    Reactivate; one role chip's remove gives way to the next);
 * 2. if the row itself stayed, its `[data-row-menu-trigger]` or first control;
 * 3. the next row's equivalent control -- same column in a table, same place
 *    from the end in a list -- else the previous row's;
 * 4. the heading of the table or list (made focusable with `tabindex=-1`).
 *
 * A confirm dialog is covered too. Its trigger is the control the dialog
 * hands focus back to, so when the row goes while the dialog is still
 * closing, focus is placed once the dialog lets go of it.
 *
 * Only a dropped focus is moved, never one the user has taken elsewhere, and
 * a re-render that merely re-attaches the ref does nothing.
 */
export function keepFocusOnRemoval(element: HTMLElement | null) {
  if (!element) return;
  trackFocusOutsideDialogs();
  return () => onDetach(element);
}

const DIALOG = '[role="dialog"], [role="alertdialog"]';
/** Popups whose items aren't a dialog's trigger: the menu's own trigger is. */
const POPUP = `${DIALOG}, [role="menu"], [role="listbox"]`;
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([type=hidden]):not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");
const HEADING = 'h1, h2, h3, h4, h5, h6, [data-slot="card-title"]';
/** How long a closing dialog has to hand focus back before we stop waiting. */
const DIALOG_WAIT_MS = 2000;

/** The last control focused outside any dialog: a confirm dialog's trigger. */
let lastFocusedOutsideDialog: Element | null = null;
let tracking = false;

function trackFocusOutsideDialogs() {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (target instanceof Element && !target.closest(POPUP)) {
        lastFocusedOutsideDialog = target;
      }
    },
    true,
  );
}

type Context = {
  cell: Element | null;
  cellIndex: number;
  row: Element | null;
  later: Element[];
  earlier: Element[];
  /** Where the control sat among its cell's controls (or its row's, in a list). */
  position: number;
  fromEnd: number;
  heading: HTMLElement | null;
};

function onDetach(element: HTMLElement) {
  // Detaching runs before React takes the node out, so the row around it is
  // still there to read.
  const active = document.activeElement;
  const holdsFocus = active !== null && element.contains(active);
  const ownsDialog =
    lastFocusedOutsideDialog === element && !!active?.closest(DIALOG);
  if (!holdsFocus && !ownsDialog) return;

  const context = readContext(element);
  queueMicrotask(() => {
    if (element.isConnected) return; // re-attached, not removed
    if (focusDropped()) {
      place(context);
      return;
    }
    if (ownsDialog) waitForDialog(context);
  });
}

function waitForDialog(context: Context) {
  const deadline = Date.now() + DIALOG_WAIT_MS;
  const check = () => {
    if (focusDropped()) return place(context);
    if (!document.activeElement?.closest(DIALOG)) return; // went elsewhere
    if (Date.now() < deadline) requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

function focusDropped() {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

function readContext(element: HTMLElement): Context {
  const row = element.closest("tr, li, [data-row]");
  // Only a cell inside the row: a list nested in a table cell is a list.
  const outerCell = row ? element.closest("td, th") : null;
  const cell = outerCell && row?.contains(outerCell) ? outerCell : null;
  const siblings = row?.parentElement
    ? Array.from(row.parentElement.children)
    : [];
  const index = row ? siblings.indexOf(row) : -1;
  const scope = cell ?? row;
  const controls = scope ? focusables(scope) : [];
  const position = controls.findIndex((control) => control.contains(element));
  return {
    cell,
    cellIndex:
      cell && cell.parentElement
        ? Array.from(cell.parentElement.children).indexOf(cell)
        : -1,
    row,
    later: index >= 0 ? siblings.slice(index + 1) : [],
    earlier: index >= 0 ? siblings.slice(0, index).reverse() : [],
    position: Math.max(position, 0),
    fromEnd: position >= 0 ? controls.length - 1 - position : 0,
    heading: headingFor(row ?? element),
  };
}

function place(context: Context) {
  const target =
    (context.cell?.isConnected && nearest(focusables(context.cell), context)) ||
    (context.row?.isConnected &&
      (context.row.querySelector<HTMLElement>("[data-row-menu-trigger]") ??
        focusables(context.row)[0])) ||
    [...context.later, ...context.earlier]
      .filter((row) => row.isConnected)
      .map((row) => equivalent(row, context))
      .find(Boolean) ||
    (context.heading?.isConnected && context.heading);
  if (!target) return;
  if (!target.matches(FOCUSABLE) && !target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus();
}

/** What took the control's place: the one now at its position, else the last. */
function nearest(controls: HTMLElement[], context: Context) {
  return controls[Math.min(context.position, controls.length - 1)];
}

/**
 * The same control in another row, counted from the end -- leading content
 * such as a name link varies by row, while a row's actions line up at the end.
 */
function equivalent(row: Element, context: Context): HTMLElement | undefined {
  const scope = context.cellIndex >= 0 ? row.children[context.cellIndex] : row;
  if (!scope) return undefined;
  const controls = focusables(scope);
  return controls[controls.length - 1 - context.fromEnd];
}

function focusables(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (control) => !control.closest("[hidden], [inert]"),
  );
}

/**
 * The heading that names the table or list: the nearest one above it in an
 * enclosing card or section.
 */
function headingFor(start: Element): HTMLElement | null {
  const list = start.closest("table, ul, ol") ?? start;
  for (
    let scope = list.parentElement;
    scope && scope !== document.body;
    scope = scope.parentElement
  ) {
    const headings = Array.from(
      scope.querySelectorAll<HTMLElement>(HEADING),
    ).filter(
      (heading) =>
        list.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_PRECEDING,
    );
    if (headings.length > 0) return headings[headings.length - 1];
  }
  return null;
}
