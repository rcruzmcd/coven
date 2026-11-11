import type { Metadata } from "next";
import { allowedReturnOrigin } from "@/lib/auth/platform-google-server";
import { parseReturnOrigin } from "@/lib/auth/platform-google";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  DRIVE_PICKER_NONCE,
  drivePickerOrigin,
  googleDriveConfig,
  pickerMimeTypes,
} from "@/lib/storage/google-drive";
import { DrivePickerPopup } from "./drive-picker-popup";

export const metadata: Metadata = {
  title: "Google Drive",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function param(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * The Google Drive Picker popup (#1630), on the platform host (#1629 Option
 * A): Google issues a Picker token only to a listed origin, so tenant pages
 * open this and receive the picked files back by `postMessage`.
 *
 * `origin` is the opener's origin, and the only place the token is ever
 * posted (`postMessage`'s target origin enforces it). It must pass the same
 * allowlist Google sign-in uses for where an ID token may go
 * (`isAllowedReturnHost`), so an unrelated site cannot open this page and be
 * handed a token. Without a platform origin (local dev) only this page's own
 * origin is accepted.
 */
export default async function DrivePickerPage({ searchParams }: Props) {
  const params = await searchParams;
  const config = googleDriveConfig();
  if (!config) return <Refusal>Google Drive is not set up here.</Refusal>;

  const nonce = param(params, "nonce");
  if (!nonce || !DRIVE_PICKER_NONCE.test(nonce)) {
    return <Refusal>This Google Drive link is incomplete.</Refusal>;
  }

  const raw = param(params, "origin");
  const platformOrigin = drivePickerOrigin();
  const targetOrigin = platformOrigin
    ? await allowedReturnOrigin(raw, platformOrigin)
    : await sameOrigin(raw);
  if (!targetOrigin) {
    return <Refusal>This Google Drive link is not valid.</Refusal>;
  }

  const mimeTypes = pickerMimeTypes(param(params, "accept"));
  return (
    <DrivePickerPopup
      config={config}
      targetOrigin={targetOrigin}
      nonce={nonce}
      mimeTypes={mimeTypes ? mimeTypes.join(",") : null}
      multiple={param(params, "multiple") === "1"}
    />
  );
}

async function sameOrigin(raw: string | undefined): Promise<string | null> {
  const origin = parseReturnOrigin(raw)?.origin;
  return origin && origin === (await getRequestOrigin()) ? origin : null;
}

function Refusal({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm items-center px-4 py-8">
      <p className="text-sm">{children}</p>
    </main>
  );
}
