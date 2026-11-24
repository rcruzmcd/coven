import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";

// send.ts imports "server-only", which throws outside Next's bundler (it is
// aliased to a no-op only during a Next.js server build) -- stub it so this
// plain `bun test` run can import the real module, the same way
// src/lib/supabase/admin.integration.test.ts does.
mock.module("server-only", () => ({}));
const { sendEmail } = await import("./send");

const MESSAGE = {
  to: "avery@example.test",
  // Composed by resolveMailIdentity() (#857) and handed straight through; this
  // module no longer knows where a sender comes from.
  from: '"Chatter Snow" <reminders@chattersnow.org>',
  subject: "2 action items need your attention",
  text: "plain",
  html: "<p>rich</p>",
};

const originalFetch = global.fetch;
const originalKey = process.env.RESEND_API_KEY;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
});

describe("sendEmail without a key", () => {
  test("logs and succeeds without calling the provider", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = mock(() => Promise.resolve(jsonResponse(200, {})));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ ok: true, id: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("names what would have been attached, for reading out of the dev log", async () => {
    // Reading this line is how an attachment gets checked without a provider,
    // which is the point of the no-op path.
    delete process.env.RESEND_API_KEY;
    const info = spyOn(console, "info").mockImplementation(() => {});
    try {
      await sendEmail({
        ...MESSAGE,
        attachments: [
          {
            filename: "event.ics",
            contentType: "text/calendar",
            content: "BEGIN:VCALENDAR",
          },
        ],
      });
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining("(attachments: event.ics)"),
      );
    } finally {
      info.mockRestore();
    }
  });
});

describe("sendEmail with a key", () => {
  test("posts the message and returns the provider's id", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(jsonResponse(200, { id: "msg_123" })),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ ok: true, id: "msg_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      from: MESSAGE.from,
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  test("succeeds with a null id when the provider answers without one", async () => {
    global.fetch = mock(() =>
      Promise.resolve(jsonResponse(200, {})),
    ) as unknown as typeof fetch;

    expect(await sendEmail(MESSAGE)).toEqual({ ok: true, id: null });
  });

  test("fails with the provider's own message on a rejection", async () => {
    global.fetch = mock(() =>
      Promise.resolve(
        jsonResponse(422, { message: "The domain is not verified." }),
      ),
    ) as unknown as typeof fetch;

    const result = await sendEmail(MESSAGE);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: "Email provider returned 422: The domain is not verified.",
    });
  });

  test("fails, rather than throwing, when the request never lands", async () => {
    global.fetch = mock(() =>
      Promise.reject(new Error("socket hang up")),
    ) as unknown as typeof fetch;

    const result = await sendEmail(MESSAGE);

    // The digest run must survive one bad send: an exception here would leave
    // every later recipient's ledger row stranded at 'pending'.
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: "Could not reach the email provider: socket hang up",
    });
  });

  test("sends a Reply-To when one is given", async () => {
    // The mailboxes people actually read are with a different provider, so a
    // reply to the sending address would bounce. Which address that is, is now
    // the tenant's -- resolved before this module is reached.
    const fetchMock = mock(() => Promise.resolve(jsonResponse(200, {})));
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendEmail({ ...MESSAGE, replyTo: "hello@chattersnow.org" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string).reply_to).toBe(
      "hello@chattersnow.org",
    );
  });

  test("omits Reply-To entirely when none is given", async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse(200, {})));
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendEmail(MESSAGE);

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).not.toHaveProperty("reply_to");
  });

  test("passes custom headers through, and omits an empty set (#1921)", async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse(200, {})));
    global.fetch = fetchMock as unknown as typeof fetch;
    const headers = {
      "List-Unsubscribe": "<https://example.test/u?t=x>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };

    await sendEmail({ ...MESSAGE, headers });
    await sendEmail({ ...MESSAGE, headers: {} });

    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse((call as unknown as [string, RequestInit])[1].body as string),
    );
    expect(bodies[0].headers).toEqual(headers);
    expect(bodies[1]).not.toHaveProperty("headers");
  });

  test("sends an attachment base64-encoded, under the provider's own keys", async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse(200, {})));
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendEmail({
      ...MESSAGE,
      attachments: [
        {
          filename: "event.ics",
          contentType: "text/calendar; charset=utf-8; method=PUBLISH",
          content: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
        },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    // snake_case content_type is Resend's spelling, not ours -- the mapping is
    // this module's whole job, so it is the thing worth asserting.
    expect(JSON.parse(init.body as string).attachments).toEqual([
      {
        filename: "event.ics",
        content: Buffer.from(
          "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
          "utf8",
        ).toString("base64"),
        content_type: "text/calendar; charset=utf-8; method=PUBLISH",
      },
    ]);
  });

  test("omits attachments entirely when there are none", async () => {
    // Every message but one, so an always-present empty array would put a key
    // in the payload of every send in the application.
    const fetchMock = mock(() => Promise.resolve(jsonResponse(200, {})));
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendEmail({ ...MESSAGE, attachments: [] });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).not.toHaveProperty("attachments");
  });

  test("refuses to send with no from address configured", async () => {
    // Reachable only when the tenant configured nothing and EMAIL_FROM is
    // unset too, which is why the message still names the variable.
    const fetchMock = mock(() => Promise.resolve(jsonResponse(200, {})));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail({ ...MESSAGE, from: "" });

    expect(result).toEqual({
      ok: false,
      error: "EMAIL_FROM is not configured.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
