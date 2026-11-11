"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DRIVE_FILE_SCOPE,
  DRIVE_PICKER_MESSAGE,
  type DrivePickerMessage,
  type GoogleDriveConfig,
  type PickedDriveDoc,
} from "@/lib/storage/google-drive";

const DrivePickerDialog = dynamic(() => import("./drive-picker-dialog"), {
  ssr: false,
});

const GSI_URL = "https://accounts.google.com/gsi/client";

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: () => void };
type GoogleIdentity = {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }) => TokenClient;
    };
  };
};

function googleIdentity(): GoogleIdentity | undefined {
  return (window as unknown as { google?: GoogleIdentity }).google;
}

function loadGsi(): Promise<void> {
  if (googleIdentity()?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gsi"));
    document.head.appendChild(script);
  });
}

type Phase =
  | { name: "loading" }
  | { name: "ready" }
  | { name: "picking"; accessToken: string }
  | { name: "error"; message: string };

/**
 * The popup's page body. The token is requested from a click on this page,
 * synchronously: a browser lets a popup open another window (Google's consent)
 * only from a user gesture, and loading the Google script first would spend
 * it. So the script loads on mount and the button waits for it.
 */
export function DrivePickerPopup({
  config,
  targetOrigin,
  nonce,
  mimeTypes,
  multiple,
}: {
  config: GoogleDriveConfig;
  targetOrigin: string;
  nonce: string;
  mimeTypes: string | null;
  multiple: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const tokenClient = useRef<TokenClient | null>(null);

  useEffect(() => {
    let active = true;
    loadGsi()
      .then(() => {
        if (!active) return;
        const oauth2 = googleIdentity()?.accounts?.oauth2;
        if (!oauth2) throw new Error("gsi");
        tokenClient.current = oauth2.initTokenClient({
          client_id: config.clientId,
          scope: DRIVE_FILE_SCOPE,
          callback: (response) => {
            if (response.access_token) {
              setPhase({ name: "picking", accessToken: response.access_token });
            } else {
              setPhase({
                name: "error",
                message: "Google Drive access was not granted.",
              });
            }
          },
          error_callback: () =>
            setPhase({
              name: "error",
              message: "Google Drive access was not granted.",
            }),
        });
        setPhase({ name: "ready" });
      })
      .catch(() => {
        if (active) {
          setPhase({
            name: "error",
            message: "Google Drive couldn't be reached. Check your connection.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [config.clientId]);

  function send(message: DrivePickerMessage) {
    const opener = window.opener as Window | null;
    if (!opener) {
      setPhase({
        name: "error",
        message:
          "This window lost track of the page that opened it. Close it and choose From Google Drive again.",
      });
      return;
    }
    // The target origin is what keeps the token from reaching anyone else.
    opener.postMessage(message, targetOrigin);
    window.close();
  }

  function picked(docs: PickedDriveDoc[]) {
    if (phase.name !== "picking") return;
    send({
      type: DRIVE_PICKER_MESSAGE,
      nonce,
      status: "picked",
      docs: docs.map(({ id, name, mimeType, sizeBytes }) => ({
        id,
        name,
        mimeType,
        sizeBytes,
      })),
      accessToken: phase.accessToken,
    });
  }

  function canceled() {
    send({ type: DRIVE_PICKER_MESSAGE, nonce, status: "canceled" });
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-lg font-semibold">Choose from Google Drive</h1>
      <p className="text-muted-foreground text-sm">
        Only the files you pick are shared with this upload, and only for this
        upload.
      </p>
      {phase.name === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      ) : null}
      {phase.name === "picking" ? (
        <DrivePickerDialog
          appId={config.appId}
          apiKey={config.apiKey}
          accessToken={phase.accessToken}
          mimeTypes={mimeTypes}
          multiple={multiple}
          onPicked={picked}
          onCanceled={canceled}
        />
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={phase.name === "loading"}
            onClick={() => tokenClient.current?.requestAccessToken()}
          >
            {phase.name === "loading" ? <Spinner /> : null}
            Open Google Drive
          </Button>
          <Button type="button" variant="outline" onClick={canceled}>
            Cancel
          </Button>
        </div>
      )}
    </main>
  );
}
