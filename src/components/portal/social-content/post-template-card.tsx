"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutTemplate,
  RotateCcw,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useActionToast } from "@/components/portal/action-toast";
import { StoryImagesPanel } from "@/components/portal/social-content/story-images-panel";
import { cropObjectPosition } from "@/lib/image-crop";
import { cn } from "@/lib/utils";
import {
  savePostTemplateTextAction,
  setPostTemplateAction,
} from "@/lib/social-content/post-template-actions";
import type {
  PostTemplateEditor,
  TemplatePhotoField,
  TemplatePhotosField,
} from "@/lib/social-content/post-template-editor";

/** How long typing must pause before the preview is redrawn (#1925). */
export const PREVIEW_DELAY_MS = 500;

const NO_TEMPLATE = "none";

/**
 * A post's template (#1925): which one it is drawn with, its text boxes and
 * photo, a live preview, Download PNG and Generate images. The preview is the
 * real PNG route drawing what is typed; it is never uploaded.
 */
export function PostTemplateCard({
  postId,
  editor,
  published,
  canManage,
  onGenerated,
}: {
  postId: string;
  editor: PostTemplateEditor;
  published: boolean;
  canManage: boolean;
  onGenerated: () => void;
}) {
  const canEdit = canManage && !published;
  // Saved values key the form, so a save (or someone else's, on refresh)
  // starts it over from what is stored.
  const savedKey = JSON.stringify([
    editor.templateKey,
    editor.fields.map((field) => field.value),
    editor.toggles.map((toggle) => toggle.value),
    editor.photo?.value,
    editor.photos?.value,
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted flex items-center gap-1.5 text-sm font-semibold">
          <LayoutTemplate className="size-4" aria-hidden />
          Post template
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canEdit && editor.choices.length > 0 && (
          <TemplatePicker postId={postId} editor={editor} />
        )}
        {editor.switchedOff && (
          <p className="app-muted text-sm">
            {editor.switchedOff} is switched off for your organization, so this
            post can&apos;t be drawn with it. Images made before stay.
          </p>
        )}
        {editor.templateKey && editor.description && (
          <p className="app-muted text-sm">{editor.description}</p>
        )}
        {editor.templateKey && editor.notice && (
          <Alert>
            <AlertDescription>{editor.notice}</AlertDescription>
          </Alert>
        )}
        {editor.templateKey ? (
          <TemplateForm
            key={savedKey}
            postId={postId}
            editor={editor}
            canEdit={canEdit}
            published={published}
            canManage={canManage}
            onGenerated={onGenerated}
          />
        ) : (
          !editor.switchedOff && (
            <p className="app-muted text-sm">
              This post isn&apos;t drawn with a template.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}

function TemplatePicker({
  postId,
  editor,
}: {
  postId: string;
  editor: PostTemplateEditor;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const value = editor.templateKey ?? NO_TEMPLATE;
  const labels = new Map<string, string>([
    ...editor.choices.map((choice) => [choice.key, choice.label] as const),
    [NO_TEMPLATE, "No template"],
  ]);

  return (
    <Field>
      <FieldLabel htmlFor="post-template">Template</FieldLabel>
      <Select
        value={value}
        disabled={isPending}
        onValueChange={(next) => {
          if (!next || next === value) return;
          run(
            () =>
              setPostTemplateAction(postId, next === NO_TEMPLATE ? null : next),
            { success: "Template changed.", onSuccess: () => router.refresh() },
          );
        }}
      >
        <SelectTrigger id="post-template" className="w-full sm:w-72">
          <SelectValue>{(v: string) => labels.get(v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {[...labels].map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        Templates that fit this post&apos;s record and format.
      </FieldDescription>
    </Field>
  );
}

function TemplateForm({
  postId,
  editor,
  canEdit,
  published,
  canManage,
  onGenerated,
}: {
  postId: string;
  editor: PostTemplateEditor;
  canEdit: boolean;
  published: boolean;
  canManage: boolean;
  onGenerated: () => void;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(editor.fields.map((field) => [field.key, field.value])),
  );
  const [photo, setPhoto] = useState(editor.photo?.value ?? "");
  const [photos, setPhotos] = useState<string[]>(
    () => editor.photos?.value ?? [],
  );
  const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      editor.toggles.map((toggle) => [toggle.key, toggle.value]),
    ),
  );

  const dirty =
    editor.fields.some((field) => values[field.key] !== field.value) ||
    editor.toggles.some((toggle) => toggles[toggle.key] !== toggle.value) ||
    (editor.photo !== null && photo !== editor.photo.value) ||
    (editor.photos !== null && !sameList(photos, editor.photos.value));

  // What is sent: every field as typed, and the photo only when it isn't the
  // record's default, so the default follows the record.
  const typed = useMemo(() => {
    const out: Record<string, string> = { ...values };
    // Every option as it stands; one at its default isn't stored.
    for (const toggle of editor.toggles) {
      out[toggle.key] = toggles[toggle.key] ? "on" : "off";
    }
    if (editor.photo) {
      out[editor.photo.key] = photo === editor.photo.start ? "" : photo;
    }
    // Several photos (#1927): unset at the default, "none" for none ticked.
    if (editor.photos) {
      out[editor.photos.key] = sameList(photos, editor.photos.start)
        ? ""
        : photos.length === 0
          ? "none"
          : photos.join(",");
    }
    return out;
  }, [
    values,
    toggles,
    photo,
    photos,
    editor.toggles,
    editor.photo,
    editor.photos,
  ]);

  // A carousel has a frame per photo; anything else the template's own.
  const frames = editor.photos?.carousel
    ? Array.from({ length: Math.max(1, photos.length) }, (_, i) => i + 1)
    : editor.frames;

  function save() {
    run(() => savePostTemplateTextAction(postId, typed), {
      success: "Template saved.",
      description: (result) =>
        result.captionUpdated ? "The caption was updated too." : undefined,
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <form
        className="flex min-w-0 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <FieldGroup className="gap-4">
          {editor.fields.map((field) => {
            const id = `template-${field.key}`;
            const value = values[field.key] ?? "";
            const Control = field.kind === "paragraph" ? Textarea : Input;
            return (
              <Field key={field.key}>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                  {canEdit && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={value === field.start}
                      focusableWhenDisabled
                      aria-label={`Reset ${field.label}`}
                      onClick={() =>
                        setValues((current) => ({
                          ...current,
                          [field.key]: field.start,
                        }))
                      }
                    >
                      <RotateCcw aria-hidden /> Reset
                    </Button>
                  )}
                </div>
                <Control
                  id={id}
                  maxLength={field.max}
                  disabled={!canEdit}
                  aria-describedby={`${id}-count`}
                  {...(field.kind === "paragraph" ? { rows: 3 } : {})}
                  value={value}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                />
                <FieldDescription id={`${id}-count`}>
                  {value.length}/{field.max} characters
                </FieldDescription>
              </Field>
            );
          })}
          {editor.toggles.map((toggle) => {
            const id = `template-${toggle.key}`;
            return (
              <Field key={toggle.key} orientation="horizontal">
                <Switch
                  id={id}
                  checked={toggles[toggle.key] ?? toggle.start}
                  disabled={!canEdit}
                  onCheckedChange={(checked) =>
                    setToggles((current) => ({
                      ...current,
                      [toggle.key]: checked,
                    }))
                  }
                />
                <FieldLabel htmlFor={id}>{toggle.label}</FieldLabel>
              </Field>
            );
          })}
          {editor.photo && (
            <PhotoChoice
              field={editor.photo}
              value={photo}
              disabled={!canEdit}
              onChange={setPhoto}
            />
          )}
          {editor.photos && (
            <PhotosChoice
              field={editor.photos}
              value={photos}
              disabled={!canEdit}
              onChange={setPhotos}
            />
          )}
        </FieldGroup>
        {canEdit && (
          <div>
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !dirty}
              focusableWhenDisabled
            >
              {isPending && <Spinner />} Save template
            </Button>
          </div>
        )}
        {published && (
          <p className="app-muted text-sm">
            This post is published, so its template stays as it is.
          </p>
        )}
        {editor.storyImages && (
          <StoryImagesPanel
            postId={postId}
            state={editor.storyImages}
            published={published}
            canManage={canManage}
            unsaved={dirty}
            onGenerated={onGenerated}
          />
        )}
      </form>
      <TemplatePreview
        postId={postId}
        frames={frames}
        format={editor.format}
        typed={typed}
      />
    </div>
  );
}

function PhotoChoice({
  field,
  value,
  disabled,
  onChange,
}: {
  field: TemplatePhotoField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <FieldSet>
      <div className="flex items-center justify-between gap-2">
        <FieldLegend variant="label">{field.label}</FieldLegend>
        {!disabled && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={value === field.start}
            focusableWhenDisabled
            aria-label={`Reset ${field.label}`}
            onClick={() => onChange(field.start)}
          >
            <RotateCcw aria-hidden /> Reset
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {field.options.map((option) => (
          <label
            key={option.id}
            className={cn(
              "flex w-28 cursor-pointer flex-col gap-1 rounded-lg border p-1.5 text-xs has-checked:border-primary has-checked:ring-2 has-checked:ring-primary/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              disabled && "cursor-not-allowed opacity-70",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              disabled={disabled}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />
            {option.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- a tenant photo of any host, not an optimisable asset
              <img
                src={option.src}
                alt=""
                className="aspect-square w-full rounded-md object-cover"
                style={
                  option.crop
                    ? { objectPosition: cropObjectPosition(option.crop) }
                    : undefined
                }
              />
            ) : (
              <span
                aria-hidden
                className="app-muted flex aspect-square w-full items-center justify-center rounded-md bg-muted"
              >
                None
              </span>
            )}
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <FieldDescription>From the record&apos;s own media.</FieldDescription>
    </FieldSet>
  );
}

function sameList(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/**
 * Several photos, ticked in order (#1927): the first is the cover, and on a
 * carousel each further one a slide. Past the format's limit the rest can't
 * be ticked.
 */
function PhotosChoice({
  field,
  value,
  disabled,
  onChange,
}: {
  field: TemplatePhotosField;
  value: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const full = value.length >= field.limit;
  const countId = useId();
  return (
    <FieldSet>
      <div className="flex items-center justify-between gap-2">
        <FieldLegend variant="label">{field.label}</FieldLegend>
        {!disabled && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={sameList(value, field.start)}
            focusableWhenDisabled
            aria-label={`Reset ${field.label}`}
            onClick={() => onChange(field.start)}
          >
            <RotateCcw aria-hidden /> Reset
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {field.options.map((option) => {
          const order = value.indexOf(option.id);
          const checked = order !== -1;
          const blocked = disabled || (!checked && full);
          return (
            <label
              key={option.id}
              className={cn(
                "relative flex w-28 cursor-pointer flex-col gap-1 rounded-lg border p-1.5 text-xs has-checked:border-primary has-checked:ring-2 has-checked:ring-primary/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                blocked && "cursor-not-allowed opacity-70",
              )}
            >
              <input
                type="checkbox"
                value={option.id}
                checked={checked}
                disabled={blocked}
                aria-label={
                  checked
                    ? `${option.label}, ${order === 0 ? "cover" : `number ${order + 1}`}`
                    : option.label
                }
                aria-describedby={countId}
                onChange={() =>
                  onChange(
                    checked
                      ? value.filter((id) => id !== option.id)
                      : [...value, option.id],
                  )
                }
                className="sr-only"
              />
              {option.src ? (
                // eslint-disable-next-line @next/next/no-img-element -- a tenant photo signed for an hour, not an optimisable asset
                <img
                  src={option.src}
                  alt=""
                  className="aspect-square w-full rounded-md object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="app-muted flex aspect-square w-full items-center justify-center rounded-md bg-muted"
                >
                  No preview
                </span>
              )}
              {checked && (
                <span
                  aria-hidden
                  className="absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                >
                  {order + 1}
                </span>
              )}
              <span aria-hidden>{option.label}</span>
            </label>
          );
        })}
      </div>
      <FieldDescription id={countId} aria-live="polite">
        {value.length} of {field.limit} chosen.{" "}
        {field.carousel
          ? "The first is the cover; each other photo is a slide of its own, in the order ticked."
          : "Shown together in one collage, in the order ticked."}
      </FieldDescription>
    </FieldSet>
  );
}

type PreviewImage = { src: string; url: string } | null;

/**
 * The live preview. Typing waits {@link PREVIEW_DELAY_MS} before a frame is
 * asked for, and the last image stays up until the next one has arrived, so
 * the preview never blanks while it redraws.
 */
function TemplatePreview({
  postId,
  frames,
  format,
  typed,
}: {
  postId: string;
  frames: readonly number[];
  format: PostTemplateEditor["format"];
  typed: Record<string, string>;
}) {
  const [wantedIndex, setIndex] = useState(0);
  // A carousel shrinks as photos are unticked (#1927); stay on its last.
  const index = Math.min(wantedIndex, Math.max(0, frames.length - 1));
  const frame = frames[index] ?? 1;
  const base = `/api/social-posts/${postId}/story/${frame}`;
  const url = `${base}?text=${encodeURIComponent(JSON.stringify(typed))}`;
  const wanted = useDebounced(url, PREVIEW_DELAY_MS);
  const [shown, setShown] = useState<PreviewImage>(null);
  const [error, setError] = useState<{ url: string; message: string } | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch(wanted, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const message =
            response.status === 400
              ? await response.text()
              : "Couldn't draw the preview.";
          setError({ url: wanted, message });
          return;
        }
        const src = URL.createObjectURL(await response.blob());
        setError(null);
        setShown((previous) => {
          if (previous) URL.revokeObjectURL(previous.src);
          return { src, url: wanted };
        });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Could not load the template preview", reason);
        setError({ url: wanted, message: "Couldn't draw the preview." });
      });
    return () => controller.abort();
  }, [wanted]);

  useEffect(
    () => () => {
      setShown((previous) => {
        if (previous) URL.revokeObjectURL(previous.src);
        return null;
      });
    },
    [],
  );

  const loading = shown?.url !== url && error?.url !== url;

  return (
    <div className="mx-auto flex w-full max-w-64 flex-col gap-2">
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg border bg-muted",
          format === "post" ? "aspect-[4/5]" : "aspect-[9/16]",
        )}
        aria-busy={loading}
      >
        {shown && (
          // eslint-disable-next-line @next/next/no-img-element -- a blob URL of the PNG route
          <img
            src={shown.src}
            alt={
              frames.length > 1
                ? `Preview of frame ${frame}`
                : "Preview of the image"
            }
            className="size-full object-contain"
          />
        )}
        {loading && (
          <span className="absolute top-2 right-2 rounded-full bg-background/80 p-1">
            <Spinner />
            <span className="sr-only">Drawing preview</span>
          </span>
        )}
      </div>
      {error?.url === url && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      {frames.length > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Previous frame"
            disabled={index === 0}
            onClick={() => setIndex(Math.max(0, index - 1))}
          >
            <ChevronLeft />
          </Button>
          <span className="app-muted text-xs" aria-live="polite">
            Frame {index + 1} of {frames.length}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Next frame"
            disabled={index === frames.length - 1}
            onClick={() => setIndex(Math.min(frames.length - 1, index + 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
      <Button
        variant="secondary"
        size="sm"
        nativeButton={false}
        render={<a href={`${url}&download=1`} download />}
      >
        <Download /> Download PNG
      </Button>
      <p className="app-muted text-xs">
        Downloads this frame as shown, to finish in Canva.
      </p>
    </div>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
