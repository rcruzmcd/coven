"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { runAction } from "@/components/portal/action-toast";
import { PlaceCombobox } from "@/components/place-combobox";
import type { PlaceOption } from "@/lib/places/search-places-action";
import { PARTY_INCLUDES_MINOR_QUESTION } from "@/lib/minors";
import { NO_INSTAGRAM_LABEL } from "@/lib/registration-contact";
import {
  updateAsksAboutMinorsAction,
  updateRequiresInstagramAction,
  updateServiceAreaAction,
  type RegistrationSettingsResult,
} from "./registration-settings-actions";

/**
 * This organization's public registration settings (#1416, #1647, #1699).
 *
 * A sheet on the Events page, the shape the Mountains sheet beside it took and
 * for its reason: settings that shape one form do not earn a route or a nav
 * entry. Saved on toggle, like the switches on Website > Legal documents.
 */
export function RegistrationSettingsSheet({
  asksAboutMinors,
  requiresInstagram,
  serviceArea,
}: {
  asksAboutMinors: boolean;
  requiresInstagram: boolean;
  serviceArea: PlaceOption[];
}) {
  // Remounted on open, so each switch starts from the server's value.
  const [openKey, setOpenKey] = useState(0);

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (nextOpen) setOpenKey((key) => key + 1);
      }}
    >
      <SheetTrigger render={<Button type="button" variant="outline" />}>
        <ClipboardList className="size-4" />
        Registration
      </SheetTrigger>
      <SheetContent side="right" size="md">
        <SheetHeader>
          <SheetTitle>Registration</SheetTitle>
          <SheetDescription>
            What the public registration form asks, for every event.
          </SheetDescription>
        </SheetHeader>
        <div
          key={openKey}
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4"
        >
          <SettingSwitch
            id="registration-asks-about-minors"
            label="Ask about under-18s at registration"
            initial={asksAboutMinors}
            save={updateAsksAboutMinorsAction}
            successOn="Registration now asks about under-18s."
            successOff="Registration no longer asks about under-18s."
          >
            Asks &ldquo;{PARTY_INCLUDES_MINOR_QUESTION}&rdquo; and, on a yes,
            for an accompanying adult and an emergency contact. Turning it off
            stops asking; answers already given stay on their registrations
            until they are cleared on the usual schedule.
          </SettingSwitch>
          <SettingSwitch
            id="registration-requires-instagram"
            label="Require an Instagram handle"
            initial={requiresInstagram}
            save={updateRequiresInstagramAction}
            successOn="Registration now requires an Instagram handle."
            successOff="Registration no longer requires an Instagram handle."
          >
            Registrants must give their Instagram handle, or tick &ldquo;
            {NO_INSTAGRAM_LABEL}&rdquo; and say how they&apos;d like to be
            reached instead. They can change it from the link in their
            confirmation email. Staff adding a registrant are not held to it.
          </SettingSwitch>
          <ServiceAreaSetting initial={serviceArea} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The states, counties and boroughs this organization serves (#1699). A
 * place question suggests places inside them first; places elsewhere can
 * still be found. Empty, every place in the US ranks the same.
 */
function ServiceAreaSetting({ initial }: { initial: PlaceOption[] }) {
  const router = useRouter();
  const [places, setPlaces] = useState(initial);
  // Cleared after each pick, so the box is ready for the next one.
  const [pickerKey, setPickerKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: PlaceOption[], success: string) {
    const previous = places;
    setError(null);
    setPlaces(next);
    startTransition(async () => {
      const outcome = await runAction<RegistrationSettingsResult>(
        () => updateServiceAreaAction(next.map((place) => place.id)),
        { success, onError: setError, onSuccess: () => router.refresh() },
      );
      if (!outcome.ok) setPlaces(previous);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p id="registration-service-area-label" className="text-sm font-medium">
          Service area
        </p>
        <p
          id="registration-service-area-help"
          className="app-muted mt-1 text-sm"
        >
          The states, counties and boroughs you serve. Place questions suggest
          places inside them first; anywhere else can still be found. With none
          set, every place in the US is suggested equally.
        </p>
      </div>
      {places.length > 0 && (
        <ul
          aria-labelledby="registration-service-area-label"
          className="flex flex-wrap gap-2"
        >
          {places.map((place) => (
            <li key={place.id}>
              <Badge variant="secondary" className="gap-1 pr-1">
                {place.label}
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted disabled:opacity-50"
                  aria-label={`Remove ${place.label}`}
                  disabled={isPending}
                  onClick={() =>
                    save(
                      places.filter((other) => other.id !== place.id),
                      `Removed ${place.label} from the service area.`,
                    )
                  }
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <PlaceCombobox
          key={pickerKey}
          id="registration-service-area"
          granularity="area"
          value={null}
          placeholder="Add a state, county or borough"
          labelledBy="registration-service-area-label"
          describedBy="registration-service-area-help"
          disabled={isPending}
          onChange={(place) => {
            if (!place || places.some((other) => other.id === place.id)) {
              return;
            }
            setPickerKey((key) => key + 1);
            save(
              [...places, place],
              `Added ${place.label} to the service area.`,
            );
          }}
        />
        {isPending && <Spinner className="size-4" />}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SettingSwitch({
  id,
  label,
  initial,
  save,
  successOn,
  successOff,
  children,
}: {
  id: string;
  label: string;
  initial: boolean;
  save: (enabled: boolean) => Promise<RegistrationSettingsResult>;
  successOn: string;
  successOff: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    setError(null);
    setChecked(next);
    startTransition(async () => {
      const outcome = await runAction<RegistrationSettingsResult>(
        () => save(next),
        {
          success: next ? successOn : successOff,
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
      if (!outcome.ok) setChecked(!next);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={`${id}-label`} className="text-sm font-medium">
            {label}
          </p>
          <p id={`${id}-help`} className="app-muted mt-1 text-sm">
            {children}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isPending && <Spinner className="size-4" />}
          <Switch
            checked={checked}
            onCheckedChange={handleChange}
            disabled={isPending}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-help`}
          />
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
