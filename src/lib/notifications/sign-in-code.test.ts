// #1765. The send's outcome may depend on the address's shape and the
// throttle, never on whether the address is known: the mint and the mail are
// deferred, so nothing they learn can reach the response.
//
// The real settings, identity and delivery modules run against a fake
// service-role client, so nothing here is mocked process-wide.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { requestSignInCode, SIGN_IN_CODE_KIND } from "./sign-in-code";

type Row = Record<string, unknown>;

function fakeAdmin(options: {
  allowed?: boolean;
  rpcError?: unknown;
  link?: { email_otp?: string; hashed_token?: string } | null;
  emailEnabled?: boolean;
}) {
  const inserted: Row[] = [];
  const rpc = mock(async () => ({
    data: options.allowed ?? true,
    error: options.rpcError ?? null,
  }));
  const generateLink = mock(async () => ({
    data: { properties: options.link ?? null },
    error: options.link ? null : { message: "boom" },
  }));

  function from(table: string) {
    let row: Row | null = null;
    const result = () => {
      if (table === "notification_deliveries" && row) {
        return { data: { id: "delivery-1" }, error: null };
      }
      if (table === "app_settings" && options.emailEnabled === false) {
        return { data: { value: false }, error: null };
      }
      return { data: table === "app_settings" ? null : null, error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "update"]) {
      chain[method] = () => chain;
    }
    chain.insert = (value: Row) => {
      row = value;
      inserted.push(value);
      return chain;
    };
    chain.single = async () => result();
    chain.maybeSingle = async () => result();
    chain.then = (resolve: (value: unknown) => void) =>
      resolve(table === "app_settings" ? { data: [], error: null } : result());
    return chain;
  }

  return {
    client: { rpc, from, auth: { admin: { generateLink } } } as never,
    rpc,
    generateLink,
    inserted,
  };
}

const input = {
  tenantId: "tenant-1",
  email: "  Rider@Example.com ",
  ipAddress: "203.0.113.9",
  fallbackOrigin: "https://fallback.test",
};

let info: ReturnType<typeof spyOn>;
let error: ReturnType<typeof spyOn>;
const savedKey = process.env.RESEND_API_KEY;
beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  info = spyOn(console, "info").mockImplementation(() => {});
  error = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  info.mockRestore();
  error.mockRestore();
  if (savedKey !== undefined) process.env.RESEND_API_KEY = savedKey;
});

function collect() {
  const deferred: (() => Promise<void>)[] = [];
  return {
    deferred,
    defer: (task: () => Promise<void>) => deferred.push(task),
  };
}

describe("requestSignInCode", () => {
  test("refuses a malformed address before touching anything", async () => {
    const { client, rpc } = fakeAdmin({});
    const { deferred, defer } = collect();
    expect(
      await requestSignInCode(client, { ...input, email: "nope" }, defer),
    ).toBe("invalid_email");
    expect(rpc).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
  });

  test("throttles per IP and address, on the normalized address", async () => {
    const { client, rpc } = fakeAdmin({ allowed: false });
    const { deferred, defer } = collect();
    expect(await requestSignInCode(client, input, defer)).toBe("rate_limited");
    expect(rpc).toHaveBeenCalledWith("check_sign_in_code_rate_limit", {
      p_email: "rider@example.com",
      p_ip_address: "203.0.113.9",
    });
    expect(deferred).toHaveLength(0);
  });

  test("fails closed when the throttle cannot be read", async () => {
    const { client } = fakeAdmin({ rpcError: { message: "down" } });
    expect(await requestSignInCode(client, input, () => {})).toBe(
      "rate_limited",
    );
  });

  test("answers before minting, then mails the code under its own kind", async () => {
    const { client, generateLink, inserted } = fakeAdmin({
      link: { email_otp: "482913", hashed_token: "hash-1" },
    });
    const { deferred, defer } = collect();
    expect(await requestSignInCode(client, input, defer)).toBe("requested");
    expect(generateLink).not.toHaveBeenCalled();

    await deferred[0]();
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "rider@example.com",
    });
    // The ledger row: no person looked up, keyed on the mint's hash, and
    // never the code.
    expect(inserted).toEqual([
      {
        tenant_id: "tenant-1",
        person_id: null,
        kind: SIGN_IN_CODE_KIND,
        dedupe_key: "sign-in-code:hash-1",
        status: "pending",
      },
    ]);
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("482913 is your"),
    );
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("to rider@example.com"),
    );
  });

  test("the same answer when the mint fails, and nothing is mailed", async () => {
    const { client, inserted } = fakeAdmin({ link: null });
    const { deferred, defer } = collect();
    expect(await requestSignInCode(client, input, defer)).toBe("requested");
    await deferred[0]();
    expect(inserted).toHaveLength(0);
  });

  test("mints nothing for a tenant with email off", async () => {
    const { client, generateLink, inserted } = fakeAdmin({
      emailEnabled: false,
      link: { email_otp: "1", hashed_token: "h" },
    });
    const { deferred, defer } = collect();
    await requestSignInCode(client, input, defer);
    await deferred[0]();
    expect(generateLink).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });
});
