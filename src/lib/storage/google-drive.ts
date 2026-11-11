/**
 * Google Drive as an upload *source* (#1627, #1630).
 *
 * Every portal upload already works on a browser `File`. These helpers turn a
 * Google Picker selection into `File`s, so an upload field adds Drive with one
 * button and runs its usual checks and upload path on the result.
 *
 * The Picker runs in a popup on the platform host (#1629, Option A), because
 * Google only issues a token to an Authorized JavaScript origin and tenant
 * custom domains are not listed. The popup posts `{ docs, accessToken }` back
 * to the opener (the message protocol is below), and the opener downloads from
 * `googleapis.com` itself -- the Drive API accepts a bearer token over CORS
 * from any origin.
 *
 * The access token is held in memory for one pick. It is never stored, logged
 * or sent to our server. Scope is `drive.file` only: the token opens just the
 * files the person picked.
 */

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** The popup page, on the platform host. Under `/auth/` so no host rewrites it. */
export const DRIVE_PICKER_PATH = "/auth/google/drive-picker";

/** `data.type` of every message the popup posts to its opener. */
export const DRIVE_PICKER_MESSAGE = "coven-drive-picker";

export type GoogleDriveConfig = {
  apiKey: string;
  clientId: string;
  appId: string;
};

/**
 * The Picker's public configuration, or null when any part is unset -- which
 * hides the Drive button (local dev, CI, other previews). Each variable is
 * read by its literal name so Next inlines it into the browser bundle.
 */
export function googleDriveConfig(): GoogleDriveConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY?.trim();
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID?.trim();
  if (!apiKey || !clientId || !appId) return null;
  return { apiKey, clientId, appId };
}

/**
 * The origin the popup opens on: the platform host when configured (the same
 * variable Google sign-in uses), else null for "this page's own origin" --
 * local dev, where `localhost` is itself an authorized origin.
 */
export function drivePickerOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// accept -> what the Picker shows
// ---------------------------------------------------------------------------

const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDES = "application/vnd.google-apps.presentation";
const GOOGLE_NATIVE_PREFIX = "application/vnd.google-apps.";

const PDF = "application/pdf";
const CSV = "text/csv";

/** The Picker filters on exact types, so a wildcard is spelled out. */
const WILDCARD_TYPES: Record<string, string[]> = {
  "image/*": [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/avif",
  ],
  "video/*": ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
};

const EXTENSION_TYPES: Record<string, string> = {
  ".pdf": PDF,
  ".csv": CSV,
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

function acceptTokens(accept: string | undefined): string[] {
  return (accept ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The MIME types the Picker should list for an `<input accept>` string, or
 * null for "anything". Google Docs/Sheets/Slides are listed when an export can
 * satisfy `accept`: Docs and Slides as PDF, Sheets as PDF or CSV.
 */
export function pickerMimeTypes(accept: string | undefined): string[] | null {
  const tokens = acceptTokens(accept);
  if (tokens.length === 0) return null;
  const types = new Set<string>();
  for (const token of tokens) {
    if (WILDCARD_TYPES[token]) {
      for (const type of WILDCARD_TYPES[token]) types.add(type);
    } else if (token.startsWith(".")) {
      const type = EXTENSION_TYPES[token];
      if (type) types.add(type);
    } else if (token.includes("/") && !token.endsWith("/*")) {
      types.add(token);
    }
  }
  if (types.has(PDF)) {
    types.add(GOOGLE_DOC);
    types.add(GOOGLE_SLIDES);
    types.add(GOOGLE_SHEET);
  }
  if (types.has(CSV)) types.add(GOOGLE_SHEET);
  return [...types];
}

/** Whether a file of `type` named `name` satisfies `accept`, as a browser would. */
export function matchesAccept(
  type: string,
  name: string,
  accept: string | undefined,
): boolean {
  const tokens = acceptTokens(accept);
  if (tokens.length === 0) return true;
  const lowerType = type.toLowerCase();
  const lowerName = name.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return lowerName.endsWith(token);
    if (token.endsWith("/*")) return lowerType.startsWith(token.slice(0, -1));
    return lowerType === token;
  });
}

// ---------------------------------------------------------------------------
// A picked doc -> what to fetch
// ---------------------------------------------------------------------------

/** The fields of a Picker `DocumentObject` these helpers read. */
export type PickedDriveDoc = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number | string;
};

export type DriveDownloadPlan = {
  id: string;
  url: string;
  /** The `File`'s name, with an extension added for an export. */
  name: string;
  /** The `File`'s type. */
  type: string;
  /** Known size, for progress; absent for an export. */
  sizeBytes: number | null;
};

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

function exportFormat(
  mimeType: string,
  accept: string | undefined,
): { type: string; extension: string } | null {
  const wantsCsv = matchesAccept(CSV, "export.csv", accept);
  const wantsPdf = matchesAccept(PDF, "export.pdf", accept);
  if (mimeType === GOOGLE_SHEET && wantsCsv) {
    return { type: CSV, extension: ".csv" };
  }
  if (
    (mimeType === GOOGLE_DOC ||
      mimeType === GOOGLE_SLIDES ||
      mimeType === GOOGLE_SHEET) &&
    wantsPdf
  ) {
    return { type: PDF, extension: ".pdf" };
  }
  return null;
}

function withExtension(name: string, extension: string): string {
  return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;
}

function sizeOf(doc: PickedDriveDoc): number | null {
  const size = Number(doc.sizeBytes);
  return Number.isFinite(size) && size >= 0 && doc.sizeBytes !== undefined
    ? size
    : null;
}

export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/** The refusal for a file over `maxBytes`, unless the field words its own. */
export type TooLargeMessage = (name: string, maxBytes: number) => string;

const defaultTooLarge: TooLargeMessage = (name, maxBytes) =>
  `${name} is larger than ${formatMegabytes(maxBytes)}.`;

/**
 * What to fetch for one picked doc, or why it can't be used. The size is
 * checked here, before anything is downloaded.
 */
export function planDriveDownload(
  doc: PickedDriveDoc,
  options: { accept?: string; maxBytes?: number; tooLarge?: TooLargeMessage },
): DriveDownloadPlan | { error: string } {
  const name = doc.name || "Untitled";
  const id = encodeURIComponent(doc.id);

  if (doc.mimeType.startsWith(GOOGLE_NATIVE_PREFIX)) {
    const format = exportFormat(doc.mimeType, options.accept);
    if (!format) return { error: `${name} can't be used here.` };
    const params = new URLSearchParams({ mimeType: format.type });
    return {
      id: doc.id,
      url: `${DRIVE_FILES}/${id}/export?${params}`,
      name: withExtension(name, format.extension),
      type: format.type,
      sizeBytes: null,
    };
  }

  if (!matchesAccept(doc.mimeType, name, options.accept)) {
    return { error: `${name} can't be used here.` };
  }
  const size = sizeOf(doc);
  if (
    options.maxBytes !== undefined &&
    size !== null &&
    size > options.maxBytes
  ) {
    return {
      error: (options.tooLarge ?? defaultTooLarge)(name, options.maxBytes),
    };
  }
  const params = new URLSearchParams({
    alt: "media",
    supportsAllDrives: "true",
  });
  return {
    id: doc.id,
    url: `${DRIVE_FILES}/${id}?${params}`,
    name,
    type: doc.mimeType,
    sizeBytes: size,
  };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** A readable sentence for a failed Drive request. */
export function driveErrorMessage(
  name: string,
  status: number,
  reason?: string,
): string {
  if (reason === "exportSizeLimitExceeded") {
    return `${name} is too large for Google to convert. Download it from Drive as a PDF and upload that instead.`;
  }
  if (status === 401) {
    return `Google Drive access expired before ${name} downloaded. Try again.`;
  }
  if (status === 404) {
    return `${name} couldn't be found in Google Drive. It may have been deleted or moved.`;
  }
  if (status === 403 || status === 429) {
    if (reason && /rateLimit|quota/i.test(reason)) {
      return `Google Drive is busy. Try ${name} again in a minute.`;
    }
    return `You don't have permission to download ${name} from Google Drive.`;
  }
  return `${name} couldn't be downloaded from Google Drive.`;
}

async function errorReason(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      error?: { errors?: { reason?: string }[] };
    };
    return body.error?.errors?.[0]?.reason;
  } catch {
    return undefined;
  }
}

async function readBody(
  response: Response,
  total: number | null,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<Blob> {
  if (!onProgress || !response.body) return response.blob();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  return new Blob(chunks as BlobPart[]);
}

/** Download one planned file. Never throws; a failure comes back as a message. */
export async function downloadDriveFile(
  plan: DriveDownloadPlan,
  accessToken: string,
  options: {
    maxBytes?: number;
    tooLarge?: TooLargeMessage;
    fetch?: typeof fetch;
    onProgress?: (loaded: number, total: number | null) => void;
  } = {},
): Promise<File | { error: string }> {
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(plan.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { error: driveErrorMessage(plan.name, 0) };
  }
  if (!response.ok) {
    return {
      error: driveErrorMessage(
        plan.name,
        response.status,
        await errorReason(response),
      ),
    };
  }
  const header = Number(response.headers.get("content-length"));
  const total = plan.sizeBytes ?? (header > 0 ? header : null);
  let blob: Blob;
  try {
    blob = await readBody(response, total, options.onProgress);
  } catch {
    return { error: driveErrorMessage(plan.name, 0) };
  }
  // An export has no size until it arrives.
  if (options.maxBytes !== undefined && blob.size > options.maxBytes) {
    return {
      error: (options.tooLarge ?? defaultTooLarge)(plan.name, options.maxBytes),
    };
  }
  return new File([blob], plan.name, { type: plan.type });
}

/**
 * Every picked doc as a `File`, in pick order. One file's failure is one
 * message and never fails the rest.
 */
export async function filesFromDrivePick(
  docs: PickedDriveDoc[],
  accessToken: string,
  options: {
    accept?: string;
    maxBytes?: number;
    tooLarge?: TooLargeMessage;
    fetch?: typeof fetch;
    onProgress?: (progress: {
      name: string;
      loaded: number;
      total: number | null;
    }) => void;
  } = {},
): Promise<{ files: File[]; errors: string[] }> {
  const files: File[] = [];
  const errors: string[] = [];
  for (const doc of docs) {
    const plan = planDriveDownload(doc, options);
    if ("error" in plan) {
      errors.push(plan.error);
      continue;
    }
    const result = await downloadDriveFile(plan, accessToken, {
      maxBytes: options.maxBytes,
      tooLarge: options.tooLarge,
      fetch: options.fetch,
      onProgress: options.onProgress
        ? (loaded, total) =>
            options.onProgress?.({ name: plan.name, loaded, total })
        : undefined,
    });
    if (result instanceof File) files.push(result);
    else errors.push(result.error);
  }
  return { files, errors };
}

// ---------------------------------------------------------------------------
// Popup <-> opener messages
// ---------------------------------------------------------------------------

export type DrivePickerMessage =
  | {
      type: typeof DRIVE_PICKER_MESSAGE;
      nonce: string;
      status: "picked";
      docs: PickedDriveDoc[];
      accessToken: string;
    }
  | { type: typeof DRIVE_PICKER_MESSAGE; nonce: string; status: "canceled" }
  | {
      type: typeof DRIVE_PICKER_MESSAGE;
      nonce: string;
      status: "error";
      message: string;
    };

/** A nonce the opener generates: 32 hex characters. */
export const DRIVE_PICKER_NONCE = /^[0-9a-f]{32}$/;

export function newDrivePickerNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function isPickedDoc(value: unknown): value is PickedDriveDoc {
  if (!value || typeof value !== "object") return false;
  const doc = value as Record<string, unknown>;
  return (
    typeof doc.id === "string" &&
    typeof doc.name === "string" &&
    typeof doc.mimeType === "string" &&
    (doc.sizeBytes === undefined ||
      typeof doc.sizeBytes === "number" ||
      typeof doc.sizeBytes === "string")
  );
}

/**
 * The popup's message, or null when `data` is not one of ours or answers a
 * different nonce. Callers check `event.origin` and `event.source` first.
 */
export function parseDrivePickerMessage(
  data: unknown,
  nonce: string,
): DrivePickerMessage | null {
  if (!data || typeof data !== "object") return null;
  const message = data as Record<string, unknown>;
  if (message.type !== DRIVE_PICKER_MESSAGE || message.nonce !== nonce) {
    return null;
  }
  if (message.status === "canceled") {
    return { type: DRIVE_PICKER_MESSAGE, nonce, status: "canceled" };
  }
  if (message.status === "error" && typeof message.message === "string") {
    return {
      type: DRIVE_PICKER_MESSAGE,
      nonce,
      status: "error",
      message: message.message,
    };
  }
  if (
    message.status === "picked" &&
    typeof message.accessToken === "string" &&
    message.accessToken &&
    Array.isArray(message.docs) &&
    message.docs.every(isPickedDoc)
  ) {
    return {
      type: DRIVE_PICKER_MESSAGE,
      nonce,
      status: "picked",
      docs: (message.docs as PickedDriveDoc[]).map((doc) => ({
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
      })),
      accessToken: message.accessToken,
    };
  }
  return null;
}

/** The popup's URL. `opener` is the origin the popup will post back to. */
export function drivePickerUrl(input: {
  pickerOrigin: string;
  opener: string;
  nonce: string;
  accept?: string;
  multiple?: boolean;
}): string {
  const params = new URLSearchParams({
    origin: input.opener,
    nonce: input.nonce,
  });
  if (input.accept) params.set("accept", input.accept);
  if (input.multiple) params.set("multiple", "1");
  return `${input.pickerOrigin}${DRIVE_PICKER_PATH}?${params}`;
}
