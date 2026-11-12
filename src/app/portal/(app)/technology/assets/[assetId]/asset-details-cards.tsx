"use client";

import { CardEditButton } from "@/components/portal/card-edit-button";
import { FormEvent, ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateAssetAction } from "../../actions";
import {
  packAssetFormData,
  type AssetFormState,
} from "../../asset-form-fields";
import {
  ASSET_STATUS_OPTIONS,
  CATEGORY_OPTIONS,
  CREDENTIAL_MANAGEMENT_LOCATION_OPTIONS,
  MFA_STATUS_OPTIONS,
  SENSITIVITY_OPTIONS,
  humanize,
} from "../../labels";
import { PersonSelect } from "../../../people/person-select";
import { ServiceSelect } from "../../service-select";
import type { PersonListItem } from "../../../people/actions";
import type {
  AssetDetail,
  ServiceRow,
} from "@/lib/portal/access-management/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { personDisplayName } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

function formStateFor(asset: AssetDetail): AssetFormState {
  return {
    name: asset.name,
    service_id: asset.service_id,
    category: asset.category,
    description: asset.description ?? "",
    url: asset.url ?? "",
    is_org_owned: asset.is_org_owned,
    owner_person_id: asset.owner_person_id,
    primary_admin_person_id: asset.primary_admin_person_id,
    backup_admin_person_id: asset.backup_admin_person_id,
    status: asset.status,
    sensitivity: asset.sensitivity,
    mfa_required: asset.mfa_required,
    mfa_status: asset.mfa_status,
    recovery_documented: asset.recovery_documented,
    recovery_owner_person_id: asset.recovery_owner_person_id,
    credential_management_location: asset.credential_management_location,
    notes: asset.notes ?? "",
  };
}

// `subject` names the card in its own receipt, so the toast says which of
// the cards on this page saved.
function useAssetCardForm(asset: AssetDetail, subject: string) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<AssetFormState>(() => formStateFor(asset));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof AssetFormState>(
    key: K,
    value: AssetFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEditing() {
    // Re-seed from the asset on every edit: a save + router.refresh() may
    // have replaced the `asset` prop since this component mounted.
    setForm(formStateFor(asset));
    setError(null);
    setMode("edit");
  }

  function cancel() {
    setError(null);
    setMode("view");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      await runAction(
        () => updateAssetAction(asset.id, packAssetFormData(form)),
        {
          success: `${subject} saved.`,
          onError: setError,
          onSuccess: () => {
            setMode("view");
            router.refresh();
          },
        },
      );
    });
  }

  return {
    mode,
    form,
    error,
    isPending,
    update,
    startEditing,
    cancel,
    handleSubmit,
  };
}

function EditableCard({
  title,
  editLabel,
  editing,
  onEdit,
  error,
  children,
}: {
  title: string;
  editLabel: string;
  editing: boolean;
  onEdit: () => void;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title}
        </CardTitle>
        <CardEditButton label={editLabel} editing={editing} onEdit={onEdit} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

function CardFormActions({
  isPending,
  onCancel,
}: {
  isPending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={isPending}
        focusableWhenDisabled
      >
        Cancel
      </Button>
      <Button type="submit" disabled={isPending} focusableWhenDisabled>
        {isPending ? (
          <>
            <Spinner /> Saving...
          </>
        ) : (
          "Save changes"
        )}
      </Button>
    </div>
  );
}

function EnumSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? value)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {(current: string) =>
            options.find((option) => option.value === current)?.label ?? current
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AssetDetailsCard({
  asset,
  services: initialServices,
  people,
}: {
  asset: AssetDetail;
  services: ServiceRow[];
  people: PersonListItem[];
}) {
  const card = useAssetCardForm(asset, "Details");
  const { form, update } = card;
  const [services, setServices] = useState(initialServices);
  const editing = card.mode === "edit";

  return (
    <EditableCard
      title="Details"
      editLabel="Edit asset details"
      editing={editing}
      onEdit={card.startEditing}
      error={card.error}
    >
      {!editing ? (
        <FieldGroup>
          <ReadOnlyField label="URL" htmlFor="asset-detail-url">
            {asset.url || "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Description" htmlFor="asset-detail-description">
            {asset.description || "—"}
          </ReadOnlyField>
          <ReadOnlyField
            label="Organization-owned"
            htmlFor="asset-detail-org-owned"
          >
            {asset.is_org_owned ? "Yes" : "No"}
          </ReadOnlyField>
          <ReadOnlyField label="Owner" htmlFor="asset-detail-owner">
            {personDisplayName(asset.owner)}
          </ReadOnlyField>
          <ReadOnlyField
            label="Primary administrator"
            htmlFor="asset-detail-primary-admin"
          >
            {personDisplayName(asset.primary_admin)}
          </ReadOnlyField>
          <ReadOnlyField
            label="Backup administrator"
            htmlFor="asset-detail-backup-admin"
          >
            {personDisplayName(asset.backup_admin)}
          </ReadOnlyField>
          <ReadOnlyField label="Notes" htmlFor="asset-detail-notes">
            {asset.notes || "—"}
          </ReadOnlyField>
        </FieldGroup>
      ) : (
        <form onSubmit={card.handleSubmit}>
          <FieldGroup>
            <RequiredFieldsNote />
            <Field>
              <FieldLabel htmlFor="asset-edit-name" required>
                Name
              </FieldLabel>
              <Input
                id="asset-edit-name"
                required
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-service">Service</FieldLabel>
              <ServiceSelect
                id="asset-edit-service"
                services={services}
                value={form.service_id}
                onChange={(serviceId) => update("service_id", serviceId)}
                onServiceCreated={(service) =>
                  setServices((prev) => [...prev, service as ServiceRow])
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-category">Category</FieldLabel>
              <EnumSelect
                id="asset-edit-category"
                value={form.category}
                onChange={(value) =>
                  update("category", value as AssetFormState["category"])
                }
                options={CATEGORY_OPTIONS}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-url">URL</FieldLabel>
              <Input
                id="asset-edit-url"
                type="url"
                placeholder="https://"
                value={form.url}
                onChange={(event) => update("url", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-description">
                Description
              </FieldLabel>
              <Textarea
                id="asset-edit-description"
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                rows={2}
              />
            </Field>

            <Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.is_org_owned}
                  onCheckedChange={(checked) =>
                    update("is_org_owned", checked === true)
                  }
                />
                Organization-owned
              </label>
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-owner">Owner</FieldLabel>
              <PersonSelect
                id="asset-edit-owner"
                people={people}
                value={form.owner_person_id}
                onChange={(personId) => update("owner_person_id", personId)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-primary-admin">
                Primary administrator
              </FieldLabel>
              <PersonSelect
                id="asset-edit-primary-admin"
                people={people}
                value={form.primary_admin_person_id}
                onChange={(personId) =>
                  update("primary_admin_person_id", personId)
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-backup-admin">
                Backup administrator
              </FieldLabel>
              <PersonSelect
                id="asset-edit-backup-admin"
                people={people}
                value={form.backup_admin_person_id}
                onChange={(personId) =>
                  update("backup_admin_person_id", personId)
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-notes">Notes</FieldLabel>
              <Textarea
                id="asset-edit-notes"
                value={form.notes}
                onChange={(event) => update("notes", event.target.value)}
                rows={4}
              />
            </Field>
          </FieldGroup>

          <CardFormActions isPending={card.isPending} onCancel={card.cancel} />
        </form>
      )}
    </EditableCard>
  );
}

export function AssetSecurityCard({
  asset,
  people,
}: {
  asset: AssetDetail;
  people: PersonListItem[];
}) {
  const card = useAssetCardForm(asset, "MFA, recovery & review");
  const { form, update } = card;
  const editing = card.mode === "edit";

  return (
    <EditableCard
      title="MFA, recovery & review"
      editLabel="Edit MFA, recovery & review"
      editing={editing}
      onEdit={card.startEditing}
      error={card.error}
    >
      {!editing ? (
        <FieldGroup>
          <ReadOnlyField
            label="MFA required"
            htmlFor="asset-detail-mfa-required"
          >
            {asset.mfa_required ? "Yes" : "No"}
          </ReadOnlyField>
          <ReadOnlyField label="MFA status" htmlFor="asset-detail-mfa-status">
            {humanize(asset.mfa_status)}
          </ReadOnlyField>
          <ReadOnlyField
            label="Recovery process documented"
            htmlFor="asset-detail-recovery-documented"
          >
            {asset.recovery_documented ? "Yes" : "No"}
          </ReadOnlyField>
          <ReadOnlyField
            label="Recovery owner"
            htmlFor="asset-detail-recovery-owner"
          >
            {personDisplayName(asset.recovery_owner)}
          </ReadOnlyField>
          <ReadOnlyField
            label="Credential management location"
            htmlFor="asset-detail-credential-location"
          >
            {humanize(asset.credential_management_location)}
          </ReadOnlyField>
          <ReadOnlyField
            label="Last reviewed"
            htmlFor="asset-detail-last-reviewed"
          >
            {asset.last_reviewed || "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Next review" htmlFor="asset-detail-next-review">
            {asset.next_review || "—"}
          </ReadOnlyField>
        </FieldGroup>
      ) : (
        <form onSubmit={card.handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="asset-edit-status">Status</FieldLabel>
              <EnumSelect
                id="asset-edit-status"
                value={form.status}
                onChange={(value) =>
                  update("status", value as AssetFormState["status"])
                }
                options={ASSET_STATUS_OPTIONS}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-sensitivity">
                Sensitivity
              </FieldLabel>
              <EnumSelect
                id="asset-edit-sensitivity"
                value={form.sensitivity}
                onChange={(value) =>
                  update("sensitivity", value as AssetFormState["sensitivity"])
                }
                options={SENSITIVITY_OPTIONS}
              />
            </Field>

            <Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.mfa_required}
                  onCheckedChange={(checked) =>
                    update("mfa_required", checked === true)
                  }
                />
                MFA required
              </label>
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-mfa-status">
                MFA status
              </FieldLabel>
              <EnumSelect
                id="asset-edit-mfa-status"
                value={form.mfa_status}
                onChange={(value) =>
                  update("mfa_status", value as AssetFormState["mfa_status"])
                }
                options={MFA_STATUS_OPTIONS}
              />
            </Field>

            <Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.recovery_documented}
                  onCheckedChange={(checked) =>
                    update("recovery_documented", checked === true)
                  }
                />
                Recovery process documented
              </label>
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-recovery-owner">
                Recovery owner
              </FieldLabel>
              <PersonSelect
                id="asset-edit-recovery-owner"
                people={people}
                value={form.recovery_owner_person_id}
                onChange={(personId) =>
                  update("recovery_owner_person_id", personId)
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-edit-credential-location">
                Credential management location
              </FieldLabel>
              <EnumSelect
                id="asset-edit-credential-location"
                value={form.credential_management_location}
                onChange={(value) =>
                  update(
                    "credential_management_location",
                    value as AssetFormState["credential_management_location"],
                  )
                }
                options={CREDENTIAL_MANAGEMENT_LOCATION_OPTIONS}
              />
            </Field>
          </FieldGroup>

          <CardFormActions isPending={card.isPending} onCancel={card.cancel} />
        </form>
      )}
    </EditableCard>
  );
}
