"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export type ConfirmTokenResult =
  { error: string } | { success: true; confirmedEmail: string };

/**
 * The button is the confirmation (#1049). A link that acts on being fetched is
 * a link a mail client's scanner acts on first, which would burn the token
 * before the person ever saw the page.
 *
 * Shared by the two confirmations that exist -- the notification override
 * (#1049) and the address on a person's own record (#1164). They confirm
 * different columns with different consequences, so they are two Server
 * Actions and two RPCs; what they are not is two copies of a button, a
 * pending state and an error alert. The action arrives as a prop from the
 * page, which is a server component, so what crosses the boundary is a Server
 * Action reference rather than a closure.
 */
export function ConfirmTokenForm({
  token,
  confirm,
  prompt,
  buttonLabel,
  doneLead,
  doneTail,
  doneNote,
  backHref,
  backLabel,
}: {
  token: string | null;
  confirm: (token: string) => Promise<ConfirmTokenResult>;
  /** What this confirmation is for, in one sentence. */
  prompt: string;
  buttonLabel: string;
  /**
   * The done sentence, split either side of the address that was confirmed.
   *
   * Two strings rather than one `(email) => ReactNode` prop, and the page each
   * one comes from is a server component: a plain function may not cross into
   * a client component at all, and the version of this that took one rendered
   * a 500 with "Functions cannot be passed directly to Client Components".
   * `confirm` gets through because it is a Server Action, which is a
   * reference the runtime knows how to serialize; an ordinary closure is not.
   */
  doneLead: string;
  doneTail: string;
  /** Anything to add under it. Already-rendered JSX, not a function. */
  doneNote: React.ReactNode;
  backHref: string;
  backLabel: string;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "done"; email: string }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function onConfirm() {
    if (!token) return;
    startTransition(async () => {
      const result = await confirm(token);
      setState(
        "error" in result
          ? { status: "error", message: result.error }
          : { status: "done", email: result.confirmedEmail },
      );
    });
  }

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This link is incomplete. Open the one in the email, or ask for a new
          one from your account page.
        </AlertDescription>
      </Alert>
    );
  }

  if (state.status === "done") {
    return (
      <div className="space-y-4">
        <p>
          {doneLead}
          <span className="font-medium">{state.email}</span>
          {doneTail}
        </p>
        {doneNote}
        <Link
          href={backHref}
          className={buttonVariants({ variant: "outline" })}
        >
          {backLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p>{prompt}</p>
      <Button
        type="button"
        disabled={isPending}
        focusableWhenDisabled
        onClick={onConfirm}
      >
        {isPending ? (
          <>
            <Spinner /> Confirming...
          </>
        ) : (
          buttonLabel
        )}
      </Button>
      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
