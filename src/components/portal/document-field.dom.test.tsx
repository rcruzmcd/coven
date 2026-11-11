import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const TENANT = "11111111-2222-4333-8444-555555555555";
const UPLOAD = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const MINTED = `${TENANT}/governance/${UPLOAD}/Bylaws-2024.pdf`;
const SAVED = `${TENANT}/governance/${UPLOAD}/Old-bylaws.pdf`;

const uploadMock = mock<
  (path: string, body: Blob, options: unknown) => Promise<{ error: unknown }>
>(async () => ({ error: null }));
const removeMock = mock<(paths: string[]) => Promise<{ error: unknown }>>(
  async () => ({ error: null }),
);

// The browser client is what's faked, not `@/lib/storage/documents`, so the
// real file checks, naming and upload error mapping run under these tests.
mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    storage: { from: () => ({ upload: uploadMock, remove: removeMock }) },
  }),
}));

const createPathMock = mock<
  (
    module: string,
    name: string,
    kind: string,
  ) => Promise<{ path: string } | { error: string }>
>(async () => ({ path: MINTED }));

mock.module("@/app/portal/(app)/document-actions", () => ({
  createDocumentPathAction: createPathMock,
}));

URL.createObjectURL = () => "blob:local-preview";
URL.revokeObjectURL = () => {};

const { DocumentField, DocumentPreview } = await import("./document-field");
const { DRIVE_PICKER_MESSAGE } = await import("@/lib/storage/google-drive");
type DocumentValue = { link: string; path: string };

function pdf(name = "Bylaws 2024.pdf") {
  return new File([new Uint8Array([37, 80, 68, 70])], name, {
    type: "application/pdf",
  });
}

function Harness({
  initial = { link: "", path: "" },
  signedUrl = null,
  onChange,
}: {
  initial?: DocumentValue;
  signedUrl?: string | null;
  onChange?: (value: DocumentValue) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DocumentField
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      signedUrl={signedUrl}
      idPrefix="bylaws"
      module="governance"
    />
  );
}

describe("DocumentField", () => {
  beforeEach(() => {
    uploadMock.mockClear();
    removeMock.mockClear();
    createPathMock.mockClear();
    createPathMock.mockImplementation(async () => ({ path: MINTED }));
    uploadMock.mockImplementation(async () => ({ error: null }));
  });

  test("a pasted link previews its host with an Open button", async () => {
    render(<Harness />);
    await userEvent.type(
      screen.getByLabelText("Link"),
      "https://drive.google.com/file/d/abc",
    );
    expect(screen.getByText("drive.google.com")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open link on drive.google.com" }),
    ).toHaveAttribute("href", "https://drive.google.com/file/d/abc");
  });

  test("a link that isn't http(s) is named but never made live", () => {
    render(
      <DocumentPreview link="javascript:alert(1)" path={null} url={null} />,
    );
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // Waits for the result: the upload awaits the action and Storage before it
  // touches state (see photo-upload-field.dom.test.tsx, #1104).
  test("an uploaded PDF replaces the link and shows its name", async () => {
    const onChange = mock<(value: DocumentValue) => void>(() => {});
    render(<Harness onChange={onChange} />);

    await userEvent.upload(screen.getByLabelText("Or upload a file"), pdf());

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ link: "", path: MINTED }),
    );
    expect(createPathMock).toHaveBeenCalledWith(
      "governance",
      "Bylaws 2024.pdf",
      "pdf",
    );
    expect(uploadMock.mock.calls[0][0]).toBe(MINTED);
    expect(await screen.findByText("Bylaws-2024.pdf")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Bylaws-2024.pdf" }),
    ).toHaveAttribute("href", "blob:local-preview");
    expect(screen.queryByLabelText("Link")).not.toBeInTheDocument();
  });

  test("a refused path is shown inline and nothing is uploaded", async () => {
    createPathMock.mockImplementation(async () => ({
      error: "Uploads are turned off in the demo. Paste a link instead.",
    }));
    render(<Harness />);

    await userEvent.upload(screen.getByLabelText("Or upload a file"), pdf());

    expect(
      await screen.findByText(
        "Uploads are turned off in the demo. Paste a link instead.",
      ),
    ).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  test("a file that is neither a PDF nor an image is refused up front", async () => {
    render(<Harness />);
    const sheet = new File(["a,b"], "budget.csv", { type: "text/csv" });

    // userEvent.upload honours `accept`; the check under test is the one
    // behind it, for a picker that doesn't.
    await userEvent.upload(screen.getByLabelText("Or upload a file"), sheet, {
      applyAccept: false,
    });

    expect(
      await screen.findByText("budget.csv is not a PDF or an image."),
    ).toBeInTheDocument();
    expect(createPathMock).not.toHaveBeenCalled();
  });

  test("a saved file opens through its signed URL", () => {
    render(
      <Harness
        initial={{ link: "", path: SAVED }}
        signedUrl="https://storage.example/signed"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Open Old-bylaws.pdf" }),
    ).toHaveAttribute("href", "https://storage.example/signed");
  });

  // The saved object is still the record's document until Save; only a file
  // uploaded in this session is deleted when it's removed.
  test("removing a saved file clears it without deleting the object", async () => {
    const onChange = mock<(value: DocumentValue) => void>(() => {});
    render(
      <Harness
        initial={{ link: "", path: SAVED }}
        signedUrl="https://storage.example/signed"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onChange).toHaveBeenCalledWith({ link: "", path: "" });
    expect(removeMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Link")).toBeInTheDocument();
  });

  test("removing a file uploaded this session deletes it", async () => {
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText("Or upload a file"), pdf());
    await screen.findByText("Bylaws-2024.pdf");

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith([MINTED]));
  });
});

// The real GoogleDriveButton, with the popup and the Drive API faked: what the
// field passes it (accept, the cap, its own refusal) is what's under test.
describe("DocumentField from Google Drive", () => {
  const ENV = {
    NEXT_PUBLIC_GOOGLE_PICKER_API_KEY: "key",
    NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: "client",
    NEXT_PUBLIC_GOOGLE_APP_ID: "123",
    NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN: "https://coven.rcmlabs.dev",
  };
  const saved = Object.fromEntries(
    Object.keys(ENV).map((key) => [key, process.env[key]]),
  );
  const realOpen = window.open;
  const realFetch = globalThis.fetch;
  const popup = { closed: false };
  let openedUrl = "";
  const driveFetch = mock<(url: string) => Promise<Response>>(
    async () => new Response(new Uint8Array([37, 80, 68, 70])),
  );

  beforeEach(() => {
    Object.assign(process.env, ENV);
    window.open = ((url: string) => {
      openedUrl = url;
      return popup as unknown as Window;
    }) as typeof window.open;
    driveFetch.mockClear();
    globalThis.fetch = driveFetch as unknown as typeof fetch;
    uploadMock.mockClear();
    createPathMock.mockClear();
    createPathMock.mockImplementation(async () => ({ path: MINTED }));
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    window.open = realOpen;
    globalThis.fetch = realFetch;
  });

  async function pickFromDrive(doc: Record<string, unknown>) {
    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive" }),
    );
    const url = new URL(openedUrl);
    expect(url.searchParams.get("accept")).toBe("application/pdf,image/*");
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: ENV.NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN,
          source: popup as unknown as Window,
          data: {
            type: DRIVE_PICKER_MESSAGE,
            nonce: url.searchParams.get("nonce"),
            status: "picked",
            accessToken: "t",
            docs: [doc],
          },
        }),
      );
    });
  }

  test("a Google Doc is exported to PDF and attached like a local file", async () => {
    const onChange = mock<(value: DocumentValue) => void>(() => {});
    render(<Harness onChange={onChange} />);

    await pickFromDrive({
      id: "doc1",
      name: "Bylaws 2024",
      mimeType: "application/vnd.google-apps.document",
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ link: "", path: MINTED }),
    );
    expect(driveFetch.mock.calls[0][0]).toContain(
      "/files/doc1/export?mimeType=application%2Fpdf",
    );
    expect(createPathMock).toHaveBeenCalledWith(
      "governance",
      "Bylaws 2024.pdf",
      "pdf",
    );
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  test("a file over 10 MB is refused before download, in the local wording", async () => {
    render(<Harness />);

    await pickFromDrive({
      id: "big",
      name: "Scan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 11 * 1024 * 1024,
    });

    expect(
      await screen.findByText(
        "Scan.pdf is larger than 10 MB. Link it instead.",
      ),
    ).toBeInTheDocument();
    expect(driveFetch).not.toHaveBeenCalled();
    expect(createPathMock).not.toHaveBeenCalled();
  });
});
