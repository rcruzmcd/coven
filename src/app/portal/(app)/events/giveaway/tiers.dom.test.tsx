import { expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import type {
  GiveawayTierConfig,
  GiveawayTierRule,
} from "../giveaway-tier-actions";
import { focusedName } from "../../../../../../test/focused";
import { TiersSection } from "./tiers";

const gold = {
  id: "t1",
  giveaway_id: "g1",
  key: "gold",
  label: "Gold",
  rank: 1,
};

function config(rules: GiveawayTierRule[]): GiveawayTierConfig {
  return {
    tiers: [gold],
    grants: [],
    rules,
    buckets: [],
    packages: [],
    totals: [],
    sales: {} as GiveawayTierConfig["sales"],
  };
}

const jacket = { id: "r1", tier_id: "t1", match_text: "jacket" };
const boots = { id: "r2", tier_id: "t1", match_text: "boots" };

function section(rules: GiveawayTierRule[]) {
  return (
    <TiersSection
      giveawayId="g1"
      config={config(rules)}
      canEdit
      onChanged={() => {}}
    />
  );
}

// Removing a keyword takes its chip and the button that had focus (#1862).
test("a removed keyword hands focus to the next keyword's remove", async () => {
  const { rerender } = render(section([jacket, boots]));
  act(() =>
    screen.getByRole("button", { name: "Remove keyword jacket" }).focus(),
  );
  rerender(section([boots]));
  await waitFor(() => expect(focusedName()).toBe("Remove keyword boots"));
});

test("the last keyword hands focus to the keywords heading", async () => {
  const { rerender } = render(section([jacket]));
  act(() =>
    screen.getByRole("button", { name: "Remove keyword jacket" }).focus(),
  );
  rerender(section([]));
  await waitFor(() => expect(focusedName()).toBe("Item type keywords"));
});
