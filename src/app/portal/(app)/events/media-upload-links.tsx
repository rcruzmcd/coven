"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Copy, Link2, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { runAction } from "@/components/portal/action-toast";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import { ViewerTime } from "@/components/viewer-time";
import { formatFileSize } from "@/lib/publications";
import {
  UPLOAD_LINK_DEFAULT_CAP_GB,
  UPLOAD_LINK_LABEL_MAX,
  UPLOAD_LINK_MAX_CAP_GB,
  UPLOAD_LINK_MIN_CAP_GB,
  defaultUploadLinkExpiry,
  uploadLinkStatus,
} from "@/lib/event-media-upload-links";
import {
  createEventMediaUploadLinkAction,
  emailEventMediaUploadLinkAction,
  listEventMediaUploadLinksAction,
  revokeEventMediaUploadLinkAction,
  type CreatedUploadLink,
  type UploadLinkRow,
} from "./media-link-actions";

const STATUS_LABELS = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
} as const;

/** `YYYY-MM-DD` in the browser's own zone, for a date input. */
function localDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The end of a picked day in the browser's zone, as the instant to store. */
function endOfLocalDay(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

/**
 * The Media card's upload links (#1620): links a coordinator sends to a
 * photographer or videographer who has no portal account, each opening one
 * page that uploads to this event. Listed with what came through each; only
 * events:manage creates or revokes, which is also the only reader shown this.
 */
export function MediaUploadLinks({
  eventId,
  eventStartsAt,
  eventEndsAt,
  timeZone,
}: {
  eventId: string;
  eventStartsAt: string;
  eventEndsAt: string | null;
  timeZone: string;
}) {
  const [links, setLinks] = useState<UploadLinkRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    listEventMediaUploadLinksAction(eventId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else {
        setLoadError(null);
        setLinks(result.links);
        setLoadedAt(new Date());
      }
    });
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleRevoke(link: UploadLinkRow) {
    setRevokingId(link.id);
    startTransition(async () => {
      await runAction(() => revokeEventMediaUploadLinkAction(link.id), {
        success: `Link for ${link.label} revoked.`,
        onSuccess: load,
      });
      setRevokingId(null);
    });
  }

  return (
    <section
      aria-labelledby="media-upload-links-heading"
      className="flex flex-col gap-3 rounded-lg border border-[var(--line)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id="media-upload-links-heading" className="font-semibold">
            Upload links
          </h3>
          <p className="app-muted text-sm">
            Send a photographer or videographer a link to upload to this event
            without a portal account. They see only an upload page — nothing
            already stored.
          </p>
        </div>
        <CreateUploadLinkDialog
          eventId={eventId}
          defaultExpiry={defaultUploadLinkExpiry({
            starts_at: eventStartsAt,
            ends_at: eventEndsAt,
          })}
          onCreated={load}
        />
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}
      {links && loadedAt && links.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Upload links">
          {links.map((link) => {
            const status = uploadLinkStatus(link, loadedAt);
            return (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[var(--line)] p-3 text-sm"
              >
                <Link2 className="app-muted size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {link.label}
                </span>
                <Badge variant={status === "active" ? "default" : "secondary"}>
                  {STATUS_LABELS[status]}
                </Badge>
                <span className="app-muted text-xs">
                  {status === "expired" ? "Expired " : "Expires "}
                  <ViewerTime iso={link.expires_at} fallbackZone={timeZone} />
                </span>
                <span className="app-muted text-xs tabular-nums">
                  {link.files === 1 ? "1 file" : `${link.files} files`}
                  {link.bytes > 0
                    ? `, ${formatFileSize(link.bytes)}`
                    : ""} of {formatFileSize(link.max_bytes)}
                </span>
                {status === "active" && (
                  <ConfirmDeleteButton
                    label={`Revoke link for ${link.label}`}
                    title={`Revoke the link for ${link.label}?`}
                    description="The link stops working at once. Everything already uploaded through it stays."
                    confirmLabel="Revoke"
                    pending={revokingId === link.id}
                    disabled={revokingId !== null}
                    onConfirm={() => handleRevoke(link)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CreateUploadLinkDialog({
  eventId,
  defaultExpiry,
  onCreated,
}: {
  eventId: string;
  defaultExpiry: Date;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState(() => localDateValue(defaultExpiry));
  const [maxGb, setMaxGb] = useState(String(UPLOAD_LINK_DEFAULT_CAP_GB));
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedUploadLink | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setLabel("");
      setExpires(localDateValue(defaultExpiry));
      setMaxGb(String(UPLOAD_LINK_DEFAULT_CAP_GB));
      setError(null);
      setCreated(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (created) {
      handleOpenChange(false);
      return;
    }
    setError(null);
    const expiresAt = endOfLocalDay(expires);
    if (!expiresAt) {
      setError("Choose when the link expires.");
      return;
    }
    startTransition(async () => {
      const result = await createEventMediaUploadLinkAction(eventId, {
        label,
        expiresAt,
        maxGb: Number(maxGb),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCreated(result.link);
      onCreated();
    });
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" variant="secondary" size="sm">
          Create upload link
        </Button>
      }
      title={created ? "Upload link created" : "Create upload link"}
      description={
        created
          ? "Copy it or show the QR code now: this is the only time the link is shown."
          : "Anyone with the link can upload photos and videos to this event until it expires or you revoke it."
      }
      size="md"
      onSubmit={handleSubmit}
      footer={
        created ? (
          <Button type="submit">Done</Button>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Spinner /> : "Create link"}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="flex flex-col items-center gap-4">
          <div className="flex w-full gap-2">
            <Input
              readOnly
              value={created.url}
              aria-label="Upload link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button type="button" variant="secondary" onClick={handleCopy}>
              <Copy className="size-4" />
              Copy
            </Button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URI, nothing to optimize */}
          <img
            src={created.qr}
            alt="QR code for the upload link"
            className="size-48 rounded-md bg-white p-2"
          />
          <EmailUploadLink eventId={eventId} url={created.url} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="upload-link-label" required>
              Who it&apos;s for
            </FieldLabel>
            <Input
              id="upload-link-label"
              autoFocus
              required
              maxLength={UPLOAD_LINK_LABEL_MAX}
              placeholder="Sam — photographer"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <FieldDescription>
              Shown on the upload page, and as the uploader of every file sent
              through the link.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="upload-link-expires" required>
              Expires
            </FieldLabel>
            <Input
              id="upload-link-expires"
              type="date"
              required
              value={expires}
              onChange={(event) => setExpires(event.target.value)}
            />
            <FieldDescription>
              At the end of that day, in your time zone. Defaults to a week
              after the event.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="upload-link-cap" required>
              Storage limit (GB)
            </FieldLabel>
            <Input
              id="upload-link-cap"
              type="number"
              required
              min={UPLOAD_LINK_MIN_CAP_GB}
              max={UPLOAD_LINK_MAX_CAP_GB}
              step={1}
              value={maxGb}
              onChange={(event) => setMaxGb(event.target.value)}
            />
            <FieldDescription>
              The most that can be uploaded through this link in total.
            </FieldDescription>
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </PortalFormSurface>
  );
}

/**
 * Emails the link just created (#1641). Only here, because the raw token
 * exists only in this dialog. A failed send says so and leaves the link to
 * copy; a sent one can go to another address too.
 */
function EmailUploadLink({ eventId, url }: { eventId: string; url: string }) {
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    setError(null);
    setSentTo(null);
    const address = to.trim();
    if (!address) {
      setError("Enter the address to send it to.");
      return;
    }
    startTransition(async () => {
      const result = await emailEventMediaUploadLinkAction(eventId, {
        url,
        to: address,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSentTo(address);
      setTo("");
    });
  }

  return (
    <Field className="w-full">
      <FieldLabel htmlFor="upload-link-email">Email it to</FieldLabel>
      <div className="flex w-full gap-2">
        <Input
          id="upload-link-email"
          type="email"
          autoComplete="off"
          placeholder="sam@example.com"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          onKeyDown={(event) => {
            // Enter submits the surrounding form, which closes the dialog.
            if (event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleSend}
          disabled={isPending}
        >
          {isPending ? <Spinner /> : <Mail className="size-4" />}
          Send
        </Button>
      </div>
      <FieldDescription>
        Optional. The email names the event, who the link is for and when it
        expires.
      </FieldDescription>
      {sentTo && (
        <p role="status" className="text-sm">
          Emailed to {sentTo}.
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </Field>
  );
}
