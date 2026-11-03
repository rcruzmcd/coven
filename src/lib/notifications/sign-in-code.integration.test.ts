// #1765. The throttle behind "send me a code". It answers a boolean and
// nothing else, so nothing about an address can come back through it, and
// only the service role may spend an address's allowance.
import { describe, expect, test } from "bun:test";
import {
  adminClient,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
  unprivilegedActors,
} from "../../../test/integration-setup";

const RPC = "check_sign_in_code_rate_limit";

describe("check_sign_in_code_rate_limit", () => {
  test("no session-holding or anonymous caller may call it", async () => {
    const actors = [
      ...(await unprivilegedActors()),
      { name: "admin", client: adminClient },
    ];
    for (const { name, client } of actors) {
      const { data, error } = await client.rpc(RPC, {
        p_email: uniqueEmail("code-grant"),
        p_ip_address: uniqueIp(),
      });
      expect({ name, data, denied: Boolean(error) }).toEqual({
        name,
        data: null,
        denied: true,
      });
    }
  });

  test("three per address from any IP, case and spacing ignored", async () => {
    const service = serviceRoleClient();
    const email = uniqueEmail("code-address");
    const answers: unknown[] = [];
    for (const variant of [email, email.toUpperCase(), ` ${email} `, email]) {
      const { data, error } = await service.rpc(RPC, {
        p_email: variant,
        p_ip_address: uniqueIp(),
      });
      expect(error).toBeNull();
      answers.push(data);
    }
    expect(answers).toEqual([true, true, true, false]);
  });

  test("five per IP across addresses", async () => {
    const service = serviceRoleClient();
    const ip = uniqueIp();
    const answers: unknown[] = [];
    for (let i = 0; i < 6; i += 1) {
      const { data } = await service.rpc(RPC, {
        p_email: uniqueEmail(`code-ip-${i}`),
        p_ip_address: ip,
      });
      answers.push(data);
    }
    expect(answers).toEqual([true, true, true, true, true, false]);
  });
});
