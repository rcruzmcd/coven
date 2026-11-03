import { describe, expect, test } from "bun:test";
import { renderSignInCodeEmail } from "./sign-in-code-email";

describe("renderSignInCodeEmail", () => {
  test("carries the code in the tenant's name, and escapes it", () => {
    const email = renderSignInCodeEmail({
      orgName: "Snow & <Co>",
      code: "482913",
      siteUrl: "https://org.test",
    });
    expect(email.subject).toBe("482913 is your Snow & <Co> code");
    expect(email.text).toContain("482913");
    expect(email.html).toContain("482913");
    expect(email.html).toContain("Snow &amp; &lt;Co&gt;");
    expect(email.html).not.toContain("<Co>");
  });
});
