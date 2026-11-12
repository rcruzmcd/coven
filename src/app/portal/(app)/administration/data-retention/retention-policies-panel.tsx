"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActionToast } from "@/components/portal/action-toast";
import {
  runRetentionDryRunAction,
  setRetentionPolicyModeAction,
} from "./actions";
import { formatRetentionPeriod } from "@/lib/retention-period";
import type { RetentionPolicyRow } from "./retention-query";

const MODE_LABEL: Record<RetentionPolicyRow["mode"], string> = {
  off: "Off",
  dry_run: "Preview only",
  enforce: "Enforcing",
};

const MODE_VARIANT: Record<
  RetentionPolicyRow["mode"],
  "secondary" | "outline" | "default"
> = {
  off: "outline",
  dry_run: "secondary",
  enforce: "default",
};

export function RetentionPoliciesPanel({
  policies,
}: {
  policies: RetentionPolicyRow[];
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();

  function changeMode(policy: RetentionPolicyRow, mode: string) {
    run(() => setRetentionPolicyModeAction(policy.policy_key, mode), {
      success: `${policy.label}: ${MODE_LABEL[mode as RetentionPolicyRow["mode"]].toLowerCase()}.`,
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Retention rules</h2>
            <p className="app-muted mt-1 text-sm leading-relaxed">
              The periods published at <code>/privacy</code>. A rule in preview
              records what it would remove without removing anything — review a
              few nights of counts below before you set one to enforcing.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={isPending}
            focusableWhenDisabled
            onClick={() =>
              run(runRetentionDryRunAction, {
                success: "Preview run finished.",
                description: "Its counts are in the run history below.",
                onSuccess: () => router.refresh(),
              })
            }
          >
            Run a preview now
          </Button>
        </div>

        <ul className="divide-y divide-[--color-line]">
          {policies.map((policy) => (
            <li
              key={policy.policy_key}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="sm:pr-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{policy.label}</span>
                  <Badge variant={MODE_VARIANT[policy.mode]}>
                    {MODE_LABEL[policy.mode]}
                  </Badge>
                </div>
                <p className="app-muted mt-1 text-sm leading-relaxed">
                  Kept for {formatRetentionPeriod(policy.period)}
                  {policy.secondary_period
                    ? `, or ${formatRetentionPeriod(policy.secondary_period)} when declined or closed`
                    : ""}
                  . {policy.description}
                </p>
                {policy.policy_key === "rate_limit_hits" ? (
                  // The one rule with nothing to scope: rate_limit_hits is keyed
                  // by IP and route and has no tenant (#707 Phase 5b). The sweep
                  // runs it once and every organization's clock is consulted, so
                  // shortening this shortens it for everyone -- worth saying, or
                  // the row reads like every other one.
                  <p className="app-muted mt-1 text-sm leading-relaxed">
                    Shared across every organization on the platform: these
                    records identify a submitter, not an organization, so the
                    shortest period anyone sets is the one that applies.
                  </p>
                ) : null}
                {policy.policy_key === "constituent_accounts" ? (
                  // The second rule with nothing to scope (#1296), and the one
                  // where the mode below does not mean what it means on every
                  // other row: an account has no organization until a claim is
                  // approved, so enforcing takes every organization agreeing.
                  // Saying so at the control is the difference between "we
                  // turned it on and nothing happened" and a rule an
                  // administrator understands.
                  <p className="app-muted mt-1 text-sm leading-relaxed">
                    Shared across every organization on the platform: an account
                    belongs to a person, not to an organization, so the shortest
                    period anyone sets is the one that applies and accounts are
                    deleted only once every organization is enforcing. Its
                    counts in the run log are the platform&rsquo;s, not just
                    yours.
                  </p>
                ) : null}
              </div>
              <Select
                value={policy.mode}
                onValueChange={(mode) => mode && changeMode(policy, mode)}
                disabled={isPending}
              >
                <SelectTrigger
                  className="sm:w-44"
                  aria-label={`Mode for ${policy.label}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="dry_run">Preview only</SelectItem>
                  <SelectItem value="enforce">Enforcing</SelectItem>
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
