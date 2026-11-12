"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import {
  APP_ICON_URL_TOKEN,
  BRAND_COLOR_TOKENS,
  DEFAULT_ACCENT_STOPS,
  DEFAULT_TYPOGRAPHY,
  MAX_ACCENT_STOPS,
  TYPOGRAPHY_SETS,
  TYPOGRAPHY_TOKEN,
  type Branding,
  type TypographySet,
} from "@/lib/branding";
import { LogoField } from "../../website/logo-field";
import { cn } from "@/lib/utils";
import { updateBrandingAction, type SettingActionResult } from "./actions";

/**
 * One row of the typeface picker (#1261): a value to store, and the type it
 * stands for.
 *
 * "Platform default" is not a sixth set -- it is the absence of a choice, so
 * it stores an empty value and borrows `DEFAULT_TYPOGRAPHY`'s families to draw
 * its specimen with. That keeps it honest the day the platform's default
 * changes: this option follows it, while picking `Neutral` outright does not.
 */
type TypographyOption = {
  value: string;
  label: string;
  description: string;
  set: TypographySet;
};

const TYPOGRAPHY_OPTIONS: readonly TypographyOption[] = [
  {
    value: "",
    label: "Platform default",
    description: `No choice of your own. Today that is ${DEFAULT_TYPOGRAPHY.label}, and if the platform's default ever changes, yours changes with it.`,
    set: DEFAULT_TYPOGRAPHY,
  },
  ...TYPOGRAPHY_SETS.map((set) => ({
    value: set.key,
    label: set.label,
    description: set.description,
    set,
  })),
];

/**
 * An option drawn in its own type rather than named in everyone else's.
 *
 * A list reading "Editorial" and "Statement" in one face says nothing about
 * the only thing being chosen here, so each row is set in the families it
 * would apply: the label in the display face at that set's own letter-spacing,
 * the description in the body face, and the script accent -- the part a line
 * of body text cannot show -- written in itself.
 *
 * Every `cssVar` interpolated below is a literal from `TYPOGRAPHY_SETS`, and
 * the root layout declares all eight families on every route. Drawing five
 * sets at once is the case `preload: false` exists for: this page fetches the
 * eight faces, and no public page fetches more than its own tenant's.
 */
function TypographySpecimen({ option }: { option: TypographyOption }) {
  const { set } = option;
  return (
    <span className="min-w-0 flex-1">
      <span
        className="block text-lg leading-tight font-semibold"
        style={{
          fontFamily: `var(${set.heading.cssVar})`,
          letterSpacing: set.headingTracking,
        }}
      >
        {option.label}
      </span>
      <span
        className="app-muted mt-1 block text-xs leading-relaxed"
        style={{ fontFamily: `var(${set.sans.cssVar})` }}
      >
        {option.description}
      </span>
      {set.accent && (
        <span
          className="mt-1 block text-base leading-tight"
          style={{ fontFamily: `var(${set.accent.cssVar})` }}
        >
          {set.accent.name}
        </span>
      )}
    </span>
  );
}

/**
 * Radios rather than a `<select>`: an option here is a specimen, and a
 * `<select>` gives an option no reliable typography of its own.
 */
function TypographyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">Typeface set</legend>
      {TYPOGRAPHY_OPTIONS.map((option) => {
        const inputId = `brand-typography-${option.value || "default"}`;
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={inputId}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
              checked
                ? "border-primary bg-primary/5"
                : "border-[var(--line)] hover:bg-muted/40",
            )}
          >
            <input
              id={inputId}
              type="radio"
              name={TYPOGRAPHY_TOKEN}
              value={option.value}
              className="mt-1.5"
              checked={checked}
              onChange={() => onChange(option.value)}
            />
            <TypographySpecimen option={option} />
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * Per-tenant branding (#707 Phase 4): the colour tokens, the accent
 * gradient, the logo and the typeface set (#1261). Everything is optional; a
 * blank field means "the platform default", and Reset puts every field back
 * to it.
 */
export function BrandingPanel({ branding }: { branding: Branding }) {
  const router = useRouter();
  const [colors, setColors] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      BRAND_COLOR_TOKENS.map((token) => [
        token.key,
        branding.colors[token.key] ?? "",
      ]),
    ),
  );
  const [accentStops, setAccentStops] = useState(
    branding.accentStops?.join(", ") ?? "",
  );
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl ?? "");
  const [appIconUrl, setAppIconUrl] = useState(branding.appIconUrl ?? "");
  // `branding.typography` is the registry's answer, not the stored string, so
  // a row naming a set the platform no longer offers arrives here as null and
  // shows as "Platform default" -- which is what the tenant's pages actually
  // render -- rather than as a picker with nothing chosen.
  const [typography, setTypography] = useState(branding.typography?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const previewStops = accentStops
    .split(",")
    .map((stop) => stop.trim())
    .filter(Boolean);
  const previewGradient = `linear-gradient(90deg, ${(previewStops.length > 1
    ? previewStops
    : previewStops.length === 1
      ? [previewStops[0], previewStops[0]]
      : DEFAULT_ACCENT_STOPS
  ).join(", ")})`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateBrandingAction(formData),
        {
          success: "Branding updated.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  function handleReset() {
    setColors(Object.fromEntries(BRAND_COLOR_TOKENS.map((t) => [t.key, ""])));
    setAccentStops("");
    setLogoUrl("");
    setAppIconUrl("");
    setTypography("");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Colours</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {BRAND_COLOR_TOKENS.map((token) => (
                <Field key={token.key}>
                  <FieldLabel htmlFor={`brand-${token.key}`}>
                    {token.label}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`${token.label} picker`}
                      value={colors[token.key] || token.defaultValue}
                      onChange={(event) =>
                        setColors({
                          ...colors,
                          [token.key]: event.target.value,
                        })
                      }
                      className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                    />
                    <Input
                      id={`brand-${token.key}`}
                      name={token.key}
                      placeholder={token.defaultValue}
                      value={colors[token.key]}
                      onChange={(event) =>
                        setColors({
                          ...colors,
                          [token.key]: event.target.value,
                        })
                      }
                      pattern="#[0-9a-fA-F]{6}"
                      className="font-mono"
                    />
                  </div>
                  <FieldDescription>{token.description}</FieldDescription>
                </Field>
              ))}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Typography</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <TypographyField value={typography} onChange={setTypography} />
                <FieldDescription>
                  Each option is shown in its own typefaces. Saving applies the
                  set everywhere at once &mdash; the public site, your links
                  page, and this portal, so the page you are reading will change
                  as soon as the save lands.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Accent bar</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="brand-accent-stops">
                  Gradient colours
                </FieldLabel>
                <div
                  aria-hidden
                  className="h-2 w-full rounded-full"
                  style={{ background: previewGradient }}
                />
                <Input
                  id="brand-accent-stops"
                  name="accent_stops"
                  placeholder={DEFAULT_ACCENT_STOPS.join(", ")}
                  value={accentStops}
                  onChange={(event) => setAccentStops(event.target.value)}
                  className="font-mono"
                />
                <FieldDescription>
                  Up to {MAX_ACCENT_STOPS} hex colours, comma-separated, left to
                  right. One colour makes a solid bar.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <LogoField
                id="brand-logo"
                uploadLabel="Upload a logo"
                label="Logo URL"
                name="logo_url"
                // Paths allowed, so not `type="url"` (#1267): the browser's
                // own URL validation demands a scheme, and a file this site
                // serves itself -- `/chatter-logo-transparent.png`, which is
                // the first tenant's logo -- is exactly what it rejects.
                // `resolveImageUrl()` supports those paths on purpose, so the
                // box has to accept what the stack already stores. Worse, a
                // rejected field blocks the whole form: a tenant whose logo
                // is a path could not save a colour or a typeface either.
                allowPaths
                ratio="3 / 1"
                value={logoUrl}
                onChange={setLogoUrl}
                description={
                  <>
                    A link may be a Google Drive link, any image URL, or a path
                    to a file this site serves, starting with <code>/</code>.
                    Shown in the site header and footer, in the portal sidebar,
                    and at the top of every email you send &mdash; so it has to
                    be reachable without signing in. A link that only works
                    while you are signed in to Drive will show as a broken image
                    in an inbox. About 360&times;120 or larger keeps it sharp;
                    email caps it at 180px wide.
                  </>
                }
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>App icon</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <LogoField
                id="brand-app-icon"
                uploadLabel="Upload an app icon"
                label="App icon URL"
                name={APP_ICON_URL_TOKEN}
                // Same as the logo above (#1267), and for the same reason:
                // an icon in `public/` is a path, not a URL with a scheme.
                allowPaths
                ratio="1 / 1"
                value={appIconUrl}
                onChange={setAppIconUrl}
                description={
                  <>
                    A <strong>square</strong> image, at least 512&times;512,
                    used when someone installs the portal on a phone. Leave this
                    blank and the home screen shows your initials on your brand
                    colour &mdash; which is usually better than a wide logo,
                    since a phone crops an app icon to a circle.
                  </>
                }
              />
            </FieldGroup>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending} focusableWhenDisabled>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save branding"
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            focusableWhenDisabled
            onClick={handleReset}
          >
            Reset to defaults
          </Button>
        </div>
      </div>
    </form>
  );
}
