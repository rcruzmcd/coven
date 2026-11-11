import { describe, expect, test } from "bun:test";
import {
  DRIVE_PICKER_MESSAGE,
  driveErrorMessage,
  drivePickerUrl,
  filesFromDrivePick,
  matchesAccept,
  parseDrivePickerMessage,
  pickerMimeTypes,
  planDriveDownload,
} from "./google-drive";

const MB = 1024 * 1024;

describe("pickerMimeTypes", () => {
  test("anything when accept is empty", () => {
    expect(pickerMimeTypes(undefined)).toBeNull();
    expect(pickerMimeTypes("")).toBeNull();
  });

  test("spells out image/* and adds Google files a PDF export satisfies", () => {
    const types = pickerMimeTypes("application/pdf,image/*")!;
    expect(types).toContain("image/jpeg");
    expect(types).toContain("image/heic");
    expect(types).toContain("application/pdf");
    expect(types).toContain("application/vnd.google-apps.document");
    expect(types).toContain("application/vnd.google-apps.presentation");
    expect(types).toContain("application/vnd.google-apps.spreadsheet");
  });

  test("a CSV field lists Sheets but not Docs", () => {
    const types = pickerMimeTypes(".csv,text/csv")!;
    expect(types).toContain("text/csv");
    expect(types).toContain("application/vnd.google-apps.spreadsheet");
    expect(types).not.toContain("application/vnd.google-apps.document");
  });

  test("an image field lists no Google files", () => {
    const types = pickerMimeTypes("image/*")!;
    expect(
      types.some((t) => t.startsWith("application/vnd.google-apps.")),
    ).toBe(false);
  });
});

describe("matchesAccept", () => {
  test("wildcards, exact types and extensions", () => {
    expect(matchesAccept("image/png", "a.png", "image/*")).toBe(true);
    expect(matchesAccept("application/pdf", "a.pdf", "image/*")).toBe(false);
    expect(matchesAccept("application/pdf", "a.pdf", "application/pdf")).toBe(
      true,
    );
    expect(matchesAccept("text/plain", "rows.CSV", ".csv")).toBe(true);
    expect(matchesAccept("text/plain", "a.txt", undefined)).toBe(true);
  });
});

describe("planDriveDownload", () => {
  test("downloads a regular file with shared-drive support", () => {
    const plan = planDriveDownload(
      {
        id: "abc",
        name: "Receipt.pdf",
        mimeType: "application/pdf",
        sizeBytes: "2048",
      },
      { accept: "application/pdf,image/*", maxBytes: 10 * MB },
    );
    expect(plan).toEqual({
      id: "abc",
      url: "https://www.googleapis.com/drive/v3/files/abc?alt=media&supportsAllDrives=true",
      name: "Receipt.pdf",
      type: "application/pdf",
      sizeBytes: 2048,
    });
  });

  test("refuses an oversized file before downloading", () => {
    const plan = planDriveDownload(
      {
        id: "abc",
        name: "Scan.pdf",
        mimeType: "application/pdf",
        sizeBytes: 11 * MB,
      },
      { accept: "application/pdf", maxBytes: 10 * MB },
    );
    expect(plan).toEqual({ error: "Scan.pdf is larger than 10 MB." });
  });

  test("words the size refusal the field's own way when asked", () => {
    const plan = planDriveDownload(
      {
        id: "abc",
        name: "Scan.pdf",
        mimeType: "application/pdf",
        sizeBytes: 11 * MB,
      },
      {
        accept: "application/pdf",
        maxBytes: 10 * MB,
        tooLarge: (name) => `${name} is too big. Link it instead.`,
      },
    );
    expect(plan).toEqual({ error: "Scan.pdf is too big. Link it instead." });
  });

  test("refuses a type the field does not accept", () => {
    const plan = planDriveDownload(
      { id: "abc", name: "Notes.txt", mimeType: "text/plain" },
      { accept: "image/*" },
    );
    expect(plan).toEqual({ error: "Notes.txt can't be used here." });
  });

  test("exports a Doc as PDF with the extension added", () => {
    const plan = planDriveDownload(
      {
        id: "d1",
        name: "Bylaws",
        mimeType: "application/vnd.google-apps.document",
      },
      { accept: "application/pdf,image/*" },
    );
    expect(plan).toMatchObject({
      url: "https://www.googleapis.com/drive/v3/files/d1/export?mimeType=application%2Fpdf",
      name: "Bylaws.pdf",
      type: "application/pdf",
      sizeBytes: null,
    });
  });

  test("exports a Sheet as CSV when the field takes CSV, else PDF", () => {
    const sheet = {
      id: "s1",
      name: "Donations",
      mimeType: "application/vnd.google-apps.spreadsheet",
    };
    expect(planDriveDownload(sheet, { accept: ".csv,text/csv" })).toMatchObject(
      {
        name: "Donations.csv",
        type: "text/csv",
      },
    );
    expect(
      planDriveDownload(sheet, { accept: "application/pdf" }),
    ).toMatchObject({
      name: "Donations.pdf",
      type: "application/pdf",
    });
  });

  test("refuses a Google file nothing here can export to", () => {
    expect(
      planDriveDownload(
        {
          id: "d1",
          name: "Bylaws",
          mimeType: "application/vnd.google-apps.document",
        },
        { accept: "image/*" },
      ),
    ).toEqual({ error: "Bylaws can't be used here." });
  });
});

describe("driveErrorMessage", () => {
  test("maps status and reason to a sentence", () => {
    expect(driveErrorMessage("a.pdf", 404)).toContain("couldn't be found");
    expect(driveErrorMessage("a.pdf", 401)).toContain("expired");
    expect(driveErrorMessage("a.pdf", 403)).toContain("permission");
    expect(driveErrorMessage("a.pdf", 403, "userRateLimitExceeded")).toContain(
      "busy",
    );
    expect(
      driveErrorMessage("a.pdf", 403, "exportSizeLimitExceeded"),
    ).toContain("too large for Google to convert");
  });
});

describe("filesFromDrivePick", () => {
  test("returns Files and per-file errors without failing the batch", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push({
        url,
        auth: new Headers(init?.headers).get("authorization"),
      });
      if (url.includes("/gone")) {
        return new Response(
          JSON.stringify({ error: { errors: [{ reason: "notFound" }] } }),
          {
            status: 404,
          },
        );
      }
      return new Response(new Uint8Array([1, 2, 3]));
    }) as typeof fetch;

    const progress: number[] = [];
    const result = await filesFromDrivePick(
      [
        { id: "ok", name: "Photo.jpg", mimeType: "image/jpeg", sizeBytes: 3 },
        { id: "gone", name: "Old.jpg", mimeType: "image/jpeg", sizeBytes: 3 },
        {
          id: "big",
          name: "Huge.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 99 * MB,
        },
      ],
      "token-123",
      {
        accept: "image/*",
        maxBytes: 10 * MB,
        fetch: fakeFetch,
        onProgress: ({ loaded }) => progress.push(loaded),
      },
    );

    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("Photo.jpg");
    expect(result.files[0].type).toBe("image/jpeg");
    expect(result.files[0].size).toBe(3);
    expect(result.errors).toEqual([
      "Old.jpg couldn't be found in Google Drive. It may have been deleted or moved.",
      "Huge.jpg is larger than 10 MB.",
    ]);
    // The oversized file was never fetched.
    expect(seen.map((s) => s.url.includes("/big"))).not.toContain(true);
    expect(seen.every((s) => s.auth === "Bearer token-123")).toBe(true);
    expect(progress).toContain(3);
  });

  test("refuses an export that arrives over the cap", async () => {
    const fakeFetch = (async () =>
      new Response(new Uint8Array(2 * MB))) as unknown as typeof fetch;
    const result = await filesFromDrivePick(
      [
        {
          id: "d1",
          name: "Deck",
          mimeType: "application/vnd.google-apps.presentation",
        },
      ],
      "t",
      { accept: "application/pdf", maxBytes: MB, fetch: fakeFetch },
    );
    expect(result.files).toHaveLength(0);
    expect(result.errors).toEqual(["Deck.pdf is larger than 1 MB."]);
  });
});

describe("popup messages", () => {
  const nonce = "0123456789abcdef0123456789abcdef";

  test("accepts a picked message for this nonce, keeping only known fields", () => {
    const parsed = parseDrivePickerMessage(
      {
        type: DRIVE_PICKER_MESSAGE,
        nonce,
        status: "picked",
        accessToken: "t",
        docs: [
          { id: "a", name: "A.pdf", mimeType: "application/pdf", url: "x" },
        ],
      },
      nonce,
    );
    expect(parsed).toEqual({
      type: DRIVE_PICKER_MESSAGE,
      nonce,
      status: "picked",
      accessToken: "t",
      docs: [
        {
          id: "a",
          name: "A.pdf",
          mimeType: "application/pdf",
          sizeBytes: undefined,
        },
      ],
    });
  });

  test("ignores another nonce, another type and malformed docs", () => {
    const base = { type: DRIVE_PICKER_MESSAGE, status: "canceled" };
    expect(
      parseDrivePickerMessage({ ...base, nonce: "other" }, nonce),
    ).toBeNull();
    expect(
      parseDrivePickerMessage({ ...base, type: "x", nonce }, nonce),
    ).toBeNull();
    expect(
      parseDrivePickerMessage(
        {
          type: DRIVE_PICKER_MESSAGE,
          nonce,
          status: "picked",
          accessToken: "t",
          docs: [{ id: 1 }],
        },
        nonce,
      ),
    ).toBeNull();
    expect(parseDrivePickerMessage("hello", nonce)).toBeNull();
  });

  test("builds the popup URL on the picker origin", () => {
    const url = new URL(
      drivePickerUrl({
        pickerOrigin: "https://coven.rcmlabs.dev",
        opener: "https://portal.chattersnow.org",
        nonce,
        accept: "image/*",
        multiple: true,
      }),
    );
    expect(url.origin).toBe("https://coven.rcmlabs.dev");
    expect(url.pathname).toBe("/auth/google/drive-picker");
    expect(url.searchParams.get("origin")).toBe(
      "https://portal.chattersnow.org",
    );
    expect(url.searchParams.get("accept")).toBe("image/*");
    expect(url.searchParams.get("multiple")).toBe("1");
  });
});
