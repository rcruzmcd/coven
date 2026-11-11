"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  drivePickerOrigin,
  drivePickerUrl,
  filesFromDrivePick,
  googleDriveConfig,
  newDrivePickerNonce,
  parseDrivePickerMessage,
  type TooLargeMessage,
} from "@/lib/storage/google-drive";

/** Show progress only past this size, so small files don't flicker. */
const PROGRESS_FROM_BYTES = 2 * 1024 * 1024;

type GoogleDriveButtonProps = {
  /** The same string as the field's `<input accept>`. */
  accept?: string;
  multiple?: boolean;
  /** Files over this are refused before they are downloaded. */
  maxBytes?: number;
  /** The field's own wording for that refusal, so Drive and a local pick match. */
  tooLarge?: TooLargeMessage;
  /** Called with the downloaded files, the same as a local pick. */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

type State =
  | { name: "idle" }
  | { name: "waiting" }
  | { name: "downloading"; label: string };

/**
 * **From Google Drive** (#1630): files picked in Google Drive come back as
 * `File`s, and the field runs its usual checks and upload on them.
 *
 * The Picker runs in a popup on the platform host (see
 * `src/lib/storage/google-drive.ts`). A message is accepted only from that
 * origin, from the window this opened, and carrying this pick's nonce. Renders
 * nothing when the Picker is not configured.
 */
export function GoogleDriveButton({
  accept,
  multiple = false,
  maxBytes,
  tooLarge,
  onFiles,
  disabled,
}: GoogleDriveButtonProps) {
  const [state, setState] = useState<State>({ name: "idle" });
  const [errors, setErrors] = useState<string[]>([]);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  if (!googleDriveConfig()) return null;

  function open() {
    cleanup.current?.();
    setErrors([]);
    const pickerOrigin = drivePickerOrigin() ?? window.location.origin;
    const nonce = newDrivePickerNonce();
    // Opened synchronously in the click, or the browser blocks it.
    const popup = window.open(
      drivePickerUrl({
        pickerOrigin,
        opener: window.location.origin,
        nonce,
        accept,
        multiple,
      }),
      "coven-drive-picker",
      "popup,width=720,height=640",
    );
    if (!popup) {
      setErrors(["Allow pop-ups for this site to choose from Google Drive."]);
      return;
    }
    setState({ name: "waiting" });

    const finish = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedPoll);
      cleanup.current = null;
    };

    async function onMessage(event: MessageEvent) {
      if (event.origin !== pickerOrigin || event.source !== popup) return;
      const message = parseDrivePickerMessage(event.data, nonce);
      if (!message) return;
      finish();
      if (message.status === "canceled") {
        setState({ name: "idle" });
        return;
      }
      if (message.status === "error") {
        setErrors([message.message]);
        setState({ name: "idle" });
        return;
      }
      setState({ name: "downloading", label: "Getting files from Drive…" });
      const { files, errors: failed } = await filesFromDrivePick(
        message.docs,
        message.accessToken,
        {
          accept,
          maxBytes,
          tooLarge,
          onProgress: ({ name, loaded, total }) => {
            if (total === null || total < PROGRESS_FROM_BYTES) return;
            const percent = Math.min(100, Math.round((loaded / total) * 100));
            setState({
              name: "downloading",
              label: `Getting ${name} from Drive… ${percent}%`,
            });
          },
        },
      );
      setErrors(failed);
      setState({ name: "idle" });
      if (files.length > 0) onFiles(files);
    }

    // A popup closed without a message (the window's own close button).
    const closedPoll = window.setInterval(() => {
      if (popup.closed) {
        finish();
        setState((current) =>
          current.name === "waiting" ? { name: "idle" } : current,
        );
      }
    }, 500);

    window.addEventListener("message", onMessage);
    cleanup.current = finish;
  }

  const busy = state.name !== "idle";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          onClick={open}
        >
          {busy ? <Spinner /> : null}
          From Google Drive
        </Button>
        {state.name === "downloading" ? (
          <span className="text-muted-foreground text-sm" role="status">
            {state.label}
          </span>
        ) : null}
      </div>
      {errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            {errors.length === 1 ? (
              errors[0]
            ) : (
              <ul className="list-disc pl-4">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
