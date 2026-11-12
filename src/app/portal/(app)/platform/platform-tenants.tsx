"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActionToast } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  provisionTenantAction,
  setTenantDomainAction,
  setTenantStatusAction,
} from "./actions";
import { TenantModulesDialog } from "./tenant-modules-dialog";
import {
  PLAN_LABEL,
  STATUS_LABEL,
  TENANT_PLANS,
  TENANT_STATUSES,
  type PlatformTenant,
} from "./platform-shared";

/**
 * The two steps that cannot be automated from here, shown where the domain is
 * set rather than left in the runbook. Both are external consoles, and a domain
 * that is set here but missing from either of them fails in a way that looks
 * like a bug in the portal.
 */
function DomainChecklist({ domain }: { domain: string }) {
  const host = domain || "example.org";
  return (
    <ul className="app-muted mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
      <li>
        Add <code>{host}</code>, <code>www.{host}</code> and{" "}
        <code>portal.{host}</code> to the Vercel project, and have the customer
        point DNS at Vercel.
      </li>
      <li>
        Add <code>{`https://${host}/**`}</code> and{" "}
        <code>{`https://portal.${host}/**`}</code> to Supabase Auth &rarr; URL
        Configuration &rarr; Redirect URLs, or invite links and OAuth callbacks
        to that domain are refused.
      </li>
    </ul>
  );
}

export function PlatformTenants({
  initialTenants,
  loadError,
  offeredPacks,
}: {
  initialTenants: PlatformTenant[];
  loadError: string | null;
  /** The content packs provisioning may copy into a new tenant (#895). */
  offeredPacks: readonly { key: string; name: string }[];
}) {
  const router = useRouter();
  const { run, isPending } = useActionToast();
  const [provisioning, setProvisioning] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlatformTenant | null>(null);
  const [modulesFor, setModulesFor] = useState<PlatformTenant | null>(null);
  const [domain, setDomain] = useState("");
  const [packKeys, setPackKeys] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  const openDomain = (tenant: PlatformTenant) => {
    setEditing(tenant);
    setDomain(tenant.custom_domain ?? "");
    setFormError(null);
  };

  function handleProvision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFormError(null);
    run(
      () =>
        provisionTenantAction({
          name: String(form.get("name") ?? ""),
          slug: String(form.get("slug") ?? ""),
          customDomain: String(form.get("domain") ?? ""),
          plan: String(form.get("plan") ?? "white_label"),
          adminEmail: String(form.get("admin") ?? ""),
          packKeys,
        }),
      {
        success: "Organization provisioned.",
        description: (result) =>
          result.link
            ? undefined
            : "No invite link: no first admin was given, or that address already has an account — they sign in with it and their access is waiting.",
        onError: setFormError,
        onSuccess: (result) => {
          setInvite(result.link);
          router.refresh();
        },
      },
    );
  }

  function handleSetDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setFormError(null);
    run(() => setTenantDomainAction(editing.id, domain), {
      success: `Domain updated for ${editing.name}.`,
      onError: setFormError,
      onSuccess: () => {
        setEditing(null);
        router.refresh();
      },
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Organizations</CardTitle>
          <Button
            onClick={() => {
              setInvite(null);
              setFormError(null);
              setPackKeys([]);
              setProvisioning(true);
            }}
          >
            Provision an organization
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead hideBelow="lg">Domain</TableHead>
                  <TableHead hideBelow="md">Plan</TableHead>
                  <TableHead hideBelow="md">Members</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialTenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <div className="font-medium">{tenant.name}</div>
                      <div className="app-muted text-xs">{tenant.slug}</div>
                    </TableCell>
                    <TableCell hideBelow="lg" className="text-sm">
                      {tenant.custom_domain ?? (
                        <span className="app-muted">Not set</span>
                      )}
                    </TableCell>
                    <TableCell hideBelow="md" className="text-sm">
                      {PLAN_LABEL[tenant.plan] ?? tenant.plan}
                    </TableCell>
                    <TableCell hideBelow="md" className="text-sm">
                      {tenant.member_count}
                      {tenant.support_grant_count > 0 ? (
                        <span className="app-muted">
                          {" "}
                          + {tenant.support_grant_count} support
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={tenant.status}
                        disabled={isPending}
                        onValueChange={(status) =>
                          status && status !== tenant.status
                            ? run(
                                () => setTenantStatusAction(tenant.id, status),
                                {
                                  success: `${tenant.name} is now ${
                                    STATUS_LABEL[status]?.toLowerCase() ??
                                    status
                                  }.`,
                                  onSuccess: () => router.refresh(),
                                },
                              )
                            : undefined
                        }
                      >
                        <SelectTrigger
                          className="w-36"
                          aria-label={`Status for ${tenant.name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TENANT_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_LABEL[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDomain(tenant)}
                      >
                        Domain
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setModulesFor(tenant)}
                      >
                        Modules
                      </Button>
                      {/* A real link, not a button: the export is a route
                          handler that streams a file, so the browser's own
                          download path is the right one. */}
                      <a
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                        href={`/portal/platform/export?tenant=${tenant.id}`}
                      >
                        Export
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="app-muted mt-4 text-xs leading-relaxed">
            Archiving takes an organization off its domains and out of every
            member&rsquo;s switcher, and is reversible. Deleting its data is
            not, and stays a command:{" "}
            <code>bun run tenant:archive &lt;slug&gt;</code> then{" "}
            <code>
              bun run tenant:delete &lt;slug&gt; --confirm &lt;slug&gt;
            </code>
            . Take an export first.
          </p>
        </CardContent>
      </Card>

      <PortalFormSurface
        open={provisioning}
        onOpenChange={(open) => !open && setProvisioning(false)}
        title="Provision an organization"
        description="Creates the organization with the five seeded roles, the platform permission matrix, the catalog defaults and its own retention rules — then stages the first admin’s access and mints their link. Nothing is emailed; send it to them yourself."
        onSubmit={handleProvision}
        footer={
          invite ? (
            <Button type="button" onClick={() => setProvisioning(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                type="button"
                onClick={() => setProvisioning(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} focusableWhenDisabled>
                Provision
              </Button>
            </>
          )
        }
      >
        {invite ? (
          <div className="flex flex-col gap-3">
            <Alert>
              <AlertDescription>
                Provisioned. This link expires in about an hour and is the only
                copy — send it now, or mint another from the
                organization&rsquo;s Users page.
              </AlertDescription>
            </Alert>
            <textarea
              readOnly
              aria-label="First admin invite link"
              value={invite}
              className="h-24 w-full rounded-md border border-[var(--line)] bg-[var(--background)] p-2 font-mono text-xs"
            />
          </div>
        ) : (
          <FieldGroup>
            <RequiredFieldsNote />
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor="tenant-name" required>
                Name
              </FieldLabel>
              <Input id="tenant-name" name="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-slug" required>
                Slug
              </FieldLabel>
              <Input
                id="tenant-slug"
                name="slug"
                required
                placeholder="example-nonprofit"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-domain">Domain</FieldLabel>
              <Input
                id="tenant-domain"
                name="domain"
                placeholder="example.org"
              />
              <DomainChecklist domain="" />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-plan">Plan</FieldLabel>
              <select
                id="tenant-plan"
                name="plan"
                defaultValue="white_label"
                className="h-9 rounded-md border border-[var(--line)] bg-[var(--background)] px-3 text-sm"
              >
                {TENANT_PLANS.map((plan) => (
                  <option key={plan} value={plan}>
                    {PLAN_LABEL[plan]}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-admin">
                First admin&rsquo;s email
              </FieldLabel>
              <Input id="tenant-admin" name="admin" type="email" />
            </Field>
            {offeredPacks.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Content packs</legend>
                <p className="app-muted text-sm">
                  Copied in as drafts. The organization reads them and publishes
                  what it wants; nothing goes on its public site here.
                </p>
                {offeredPacks.map((pack) => (
                  <Field key={pack.key} orientation="horizontal">
                    <Checkbox
                      id={`provision-pack-${pack.key}`}
                      checked={packKeys.includes(pack.key)}
                      onCheckedChange={(checked) =>
                        setPackKeys((keys) =>
                          checked
                            ? [...keys, pack.key]
                            : keys.filter((key) => key !== pack.key),
                        )
                      }
                    />
                    <FieldLabel
                      htmlFor={`provision-pack-${pack.key}`}
                      className="font-normal"
                    >
                      {pack.name}
                    </FieldLabel>
                  </Field>
                ))}
              </fieldset>
            )}
          </FieldGroup>
        )}
      </PortalFormSurface>

      <PortalFormSurface
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={`Domain for ${editing?.name ?? ""}`}
        description={
          <>
            The host is what decides which organization a public request is for.
            One domain covers its <code>www.</code> and <code>portal.</code>{" "}
            subdomains too. Leave it blank to take the organization off its
            domain.
          </>
        }
        onSubmit={handleSetDomain}
        footer={
          <>
            <PortalFormSurfaceClose
              render={<Button type="button" variant="outline" />}
            >
              Cancel
            </PortalFormSurfaceClose>
            <Button type="submit" disabled={isPending} focusableWhenDisabled>
              Save
            </Button>
          </>
        }
      >
        <FieldGroup>
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <Field>
            <FieldLabel htmlFor="edit-domain">Domain</FieldLabel>
            <Input
              id="edit-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="example.org"
            />
            <DomainChecklist domain={domain.trim().toLowerCase()} />
          </Field>
        </FieldGroup>
      </PortalFormSurface>

      {/* Mounted per organization, so the dialog's own state -- what it has
          loaded, what is awaiting confirmation -- starts fresh each time
          rather than being reset on the way in. */}
      {modulesFor ? (
        <TenantModulesDialog
          key={modulesFor.id}
          tenant={modulesFor}
          onClose={() => setModulesFor(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
