"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Film,
  ImageOff,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { personDisplayName } from "@/lib/format";
import { normalizeHandle } from "@/lib/social-content/piece-form";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Spinner } from "@/components/ui/spinner";
import {
  formatTakesCaption,
  formatTakesCollaborators,
  postFormatLabel,
  type ContentPieceRow,
} from "@/lib/social-content/pieces";
import {
  getSocialPostExtrasAction,
  type SocialPostExtras,
  type SocialPostMedia,
  type SocialPostTag,
  type SocialPostTagPerson,
} from "@/lib/social-content/post-content-actions";

/**
 * The parts of a social post's Content section that are lists (#1826):
 * collaborators, people to tag and media. The sheet owns the state; these
 * render it and report changes.
 */

function HandleChip({
  label,
  onRemove,
  warning,
}: {
  label: string;
  onRemove?: () => void;
  warning?: string;
}) {
  return (
    <Badge
      variant={warning ? "warning" : "secondary"}
      className="h-auto max-w-full gap-1 py-0.5 pr-0.5"
    >
      {warning && <AlertTriangle aria-hidden="true" />}
      <span className="truncate">{label}</span>
      {warning && <span className="sr-only">({warning})</span>}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <X />
        </Button>
      )}
    </Badge>
  );
}

/**
 * Instagram handles typed one at a time: Enter or a comma adds one. A value
 * that is not a handle stays in the box with an error rather than vanishing.
 */
export function HandleListInput({
  id,
  values,
  onChange,
  max,
  describedBy,
}: {
  id: string;
  values: string[];
  onChange: (next: string[]) => void;
  max: number;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = values.length >= max;

  function add() {
    if (!draft.trim()) return;
    const handle = normalizeHandle(draft);
    if (!handle) {
      setError(`"${draft.trim()}" is not an Instagram handle.`);
      return;
    }
    setError(null);
    setDraft("");
    if (!values.includes(handle)) onChange([...values, handle]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Added">
          {values.map((handle) => (
            <li key={handle} className="max-w-full">
              <HandleChip
                label={`@${handle}`}
                onRemove={() =>
                  onChange(values.filter((value) => value !== handle))
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          placeholder={full ? `Up to ${max}` : "@handle"}
          disabled={full}
          value={draft}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [describedBy, error ? `${id}-error` : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={add}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={full || !draft.trim()}
          onClick={add}
        >
          Add
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const DECLINED = "declined photo consent";

function tagKey(tag: SocialPostTag) {
  return "personId" in tag ? `p:${tag.personId}` : `h:${tag.handle}`;
}

/**
 * People to tag: pick someone on record (their handle comes from their
 * record), or type a handle for anyone else. Picking a person who declined
 * photo consent asks first, and their chip stays marked.
 */
export function TagPeopleInput({
  id,
  tags,
  people,
  onChange,
  describedBy,
}: {
  id: string;
  tags: SocialPostTag[];
  people: SocialPostTagPerson[];
  onChange: (next: SocialPostTag[]) => void;
  describedBy?: string;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SocialPostTagPerson | null>(
    null,
  );
  const byId = new Map(people.map((person) => [person.id, person]));
  const tagged = new Set(tags.map(tagKey));

  const needle = query.trim().replace(/^@/, "").toLowerCase();
  const suggestions = needle
    ? people
        .filter(
          (person) =>
            !tagged.has(`p:${person.id}`) &&
            person.instagram_handle &&
            [person.name, person.preferred_name, person.instagram_handle].some(
              (value) => value?.toLowerCase().includes(needle),
            ),
        )
        .slice(0, 6)
    : [];

  function addPerson(person: SocialPostTagPerson) {
    setQuery("");
    setError(null);
    onChange([...tags, { personId: person.id }]);
  }

  function pickPerson(person: SocialPostTagPerson) {
    if (person.declined_photo_consent) setConfirming(person);
    else addPerson(person);
  }

  function addHandle() {
    if (!query.trim()) return;
    const handle = normalizeHandle(query);
    if (!handle) {
      setError(
        suggestions.length > 0
          ? "Pick a person from the list, or type their Instagram handle."
          : `"${query.trim()}" is not an Instagram handle.`,
      );
      return;
    }
    // A handle that belongs to someone on record tags them instead, so their
    // consent answer is seen.
    const person = people.find(
      (candidate) => candidate.instagram_handle?.toLowerCase() === handle,
    );
    if (person) {
      if (!tagged.has(`p:${person.id}`)) pickPerson(person);
      else setQuery("");
      return;
    }
    setQuery("");
    setError(null);
    if (!tagged.has(`h:${handle}`)) onChange([...tags, { handle }]);
  }

  function chipFor(tag: SocialPostTag) {
    if ("handle" in tag) return { label: `@${tag.handle}` };
    const person = byId.get(tag.personId);
    const name = personDisplayName(person, "Someone no longer listed");
    return {
      label: person?.instagram_handle
        ? `${name} (@${person.instagram_handle})`
        : `${name} (no Instagram handle on record)`,
      warning: person?.declined_photo_consent ? DECLINED : undefined,
    };
  }

  const listId = `${id}-suggestions`;

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tagged">
          {tags.map((tag) => {
            const chip = chipFor(tag);
            return (
              <li key={tagKey(tag)} className="max-w-full">
                <HandleChip
                  label={chip.label}
                  warning={chip.warning}
                  onRemove={() =>
                    onChange(
                      tags.filter(
                        (candidate) => tagKey(candidate) !== tagKey(tag),
                      ),
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          placeholder="Search people or type @handle"
          autoComplete="off"
          value={query}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [describedBy, error ? `${id}-error` : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-controls={suggestions.length > 0 ? listId : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (suggestions.length === 1) pickPerson(suggestions[0]);
              else addHandle();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!query.trim()}
          onClick={addHandle}
        >
          Add
        </Button>
      </div>
      {suggestions.length > 0 && (
        <ul
          id={listId}
          aria-label="Matching people"
          className="flex flex-col rounded-lg border"
        >
          {suggestions.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => pickPerson(person)}
              >
                <span className="min-w-0 flex-1 truncate">
                  {personDisplayName(person)}{" "}
                  <span className="app-muted">@{person.instagram_handle}</span>
                </span>
                {person.declined_photo_consent && (
                  <Badge variant="warning">Declined photo consent</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(next) => !next && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Tag {personDisplayName(confirming)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They declined photo consent. Tagging them points people to them in
              a photo they asked not to be shared in. Check with them first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Don&apos;t tag</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) addPerson(confirming);
                setConfirming(null);
              }}
            >
              Tag anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Read-only chips for the sheet's view mode. */
export function TagList({
  tags,
  people,
}: {
  tags: SocialPostTag[];
  people: SocialPostTagPerson[];
}) {
  if (tags.length === 0) return <>—</>;
  const byId = new Map(people.map((person) => [person.id, person]));
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        if ("handle" in tag) {
          return (
            <li key={tagKey(tag)}>
              <HandleChip label={`@${tag.handle}`} />
            </li>
          );
        }
        const person = byId.get(tag.personId);
        const name = personDisplayName(person, "Someone no longer listed");
        return (
          <li key={tagKey(tag)} className="max-w-full">
            <HandleChip
              label={
                person?.instagram_handle
                  ? `${name} (@${person.instagram_handle})`
                  : `${name} (no Instagram handle on record)`
              }
              warning={person?.declined_photo_consent ? DECLINED : undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A post's media in carousel order. With `onMove`/`onRemove` it can be
 * reordered and pruned; without, it is read-only. An item taken from the
 * event whose file has since been deleted there shows as missing (#1827).
 */
export function PostMediaGrid({
  media,
  busy = false,
  onMove,
  onRemove,
}: {
  media: SocialPostMedia[];
  busy?: boolean;
  onMove?: (index: number, direction: -1 | 1) => void;
  onRemove?: (item: SocialPostMedia) => void;
}) {
  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Media">
      {media.map((item, index) => (
        <li key={item.id} className="flex flex-col gap-1">
          <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
            {item.url && item.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not an optimisable asset
              <img
                src={item.url}
                alt={item.original_filename}
                className="size-full object-cover"
              />
            ) : item.url ? (
              <video
                src={item.url}
                muted
                preload="metadata"
                aria-label={item.original_filename}
                className="size-full object-cover"
              />
            ) : item.missing ? (
              <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-center text-xs text-destructive">
                <ImageOff aria-hidden="true" className="size-4" />
                Missing: deleted from the event
              </span>
            ) : (
              <span className="app-muted flex size-full items-center justify-center p-1 text-center text-xs">
                {item.original_filename}
              </span>
            )}
            {item.kind === "video" && (
              <Film
                aria-hidden="true"
                className="absolute right-1 bottom-1 size-4 text-white drop-shadow"
              />
            )}
            <span className="absolute top-1 left-1 rounded bg-background/80 px-1 text-xs tabular-nums">
              {index + 1}
            </span>
          </div>
          {(onMove || onRemove) && (
            <div className="flex justify-center gap-0.5">
              {onMove && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={busy || index === 0}
                    aria-label={`Move ${item.original_filename} earlier`}
                    onClick={() => onMove(index, -1)}
                  >
                    <ArrowLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={busy || index === media.length - 1}
                    aria-label={`Move ${item.original_filename} later`}
                    onClick={() => onMove(index, 1)}
                  >
                    <ArrowRight />
                  </Button>
                </>
              )}
              {onRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={busy}
                  aria-label={`Remove ${item.original_filename}`}
                  onClick={() => onRemove(item)}
                >
                  <X />
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * A post's tags, the people it can tag and its media (#1826), loaded once per
 * opening and again after its media changes. Null until the first load.
 */
export function usePostExtras(postId: string | null, eventId: string | null) {
  const [extras, setExtras] = useState<SocialPostExtras | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getSocialPostExtrasAction(postId, eventId).then((next) => {
      if (!cancelled) setExtras(next);
    });
    return () => {
      cancelled = true;
    };
  }, [postId, eventId, version]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { extras, reload };
}

/**
 * A post's content, read-only: format, caption, collaborators, tags and media.
 * The post sheet's view mode and the post's own page both show it.
 */
export function PostContentSummary({
  piece,
  extras,
  idPrefix,
}: {
  piece: Pick<
    ContentPieceRow,
    "post_format" | "content" | "collaborator_handles"
  >;
  extras: SocialPostExtras | null;
  idPrefix: string;
}) {
  return (
    <>
      <ReadOnlyField label="Format" htmlFor={`${idPrefix}-format`}>
        {postFormatLabel(piece.post_format) ?? "Not chosen"}
      </ReadOnlyField>
      <ReadOnlyField
        label={formatTakesCaption(piece.post_format) ? "Caption" : "Story text"}
        htmlFor={`${idPrefix}-content`}
      >
        <span className="whitespace-pre-wrap">{piece.content || "—"}</span>
      </ReadOnlyField>
      {formatTakesCollaborators(piece.post_format) && (
        <ReadOnlyField
          label="Collaborators"
          htmlFor={`${idPrefix}-collaborators`}
        >
          {piece.collaborator_handles.length > 0
            ? piece.collaborator_handles
                .map((handle) => `@${handle}`)
                .join(", ")
            : "—"}
        </ReadOnlyField>
      )}
      <ReadOnlyField label="People to tag" htmlFor={`${idPrefix}-tags`}>
        {extras ? (
          <TagList tags={extras.tags} people={extras.people} />
        ) : (
          <Spinner />
        )}
      </ReadOnlyField>
      <ReadOnlyField label="Media" htmlFor={`${idPrefix}-media`}>
        {!extras ? (
          <Spinner />
        ) : extras.media.length > 0 ? (
          <PostMediaGrid media={extras.media} />
        ) : (
          "—"
        )}
      </ReadOnlyField>
    </>
  );
}
