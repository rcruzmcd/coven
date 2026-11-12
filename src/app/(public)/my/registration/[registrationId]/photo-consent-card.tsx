"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PHOTO_CONSENT_HEADING,
  PHOTO_OBJECTION_ACTION,
  PHOTO_OBJECTION_NONE,
  PHOTO_OBJECTION_RECORDED,
  PHOTO_OBJECTION_WITHDRAWN,
  PHOTO_OBJECTION_WITHDRAW_ACTION,
} from "@/lib/photo-consent";
import { setMyPhotoConsentAction } from "./photo-consent-actions";

/**
 * Asking not to be photographed, from your own registration (#599, #1376).
 *
 * **The direction is reversed.** #599 put a consent box here, because
 * registering asked a question and this is where the answer could be changed.
 * Registering no longer asks anything: it carries the agreement, and the
 * remedy is objection. So the primary action records an objection, and
 * withdrawing one is offered only once there is something to withdraw.
 *
 * **It is one of three routes and the only self-service one.** The other two
 * — telling an organizer, and emailing — are what the privacy policy names
 * first, because `set_my_photo_consent()` resolves through
 * `my_constituent_person_id('events')` and so reaches only somebody who has
 * claimed an account. Most registrants have not. That is why this card is a
 * convenience rather than the mechanism, and why nothing anywhere says
 * "change it from your registration page" without qualifying it.
 *
 * It renders only where the organization publishes paragraphs. With none there
 * is nothing to object to, nothing was implied by registering, and
 * `set_my_photo_consent()` would refuse the write anyway — offering a control
 * that cannot be saved would be worse than offering none.
 *
 * The paragraphs are **today's** text, not the snapshot on the row: somebody
 * objecting is objecting to the words as they read now, and that is what the
 * RPC re-snapshots onto the row.
 *
 * A pair of buttons rather than a checkbox and a Save. A box that starts
 * unticked beside "photos are fine" is a consent control, and a consent
 * control is the thing this ticket removed.
 */
export function PhotoConsentCard({
  registrationId,
  paragraphs,
  consent,
}: {
  registrationId: string;
  /** The organization's paragraphs as they read now. Never rendered when empty. */
  paragraphs: string[];
  /**
   * What is on the record: `null` for no objection, `false` for an objection,
   * `true` for one withdrawn or explicitly confirmed. Null is the resting
   * state of every registration taken through this site.
   */
  consent: boolean | null;
}) {
  const [saved, setSaved] = useState<boolean | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const written = paragraphs.filter((paragraph) => paragraph.trim());
  if (written.length === 0) return null;

  const stored = saved === undefined ? consent : saved;
  // `null` and `true` both mean "not objecting", so both offer the objection.
  // Only a stored `false` is something to withdraw.
  const objecting = stored === false;

  function save(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setMyPhotoConsentAction(registrationId, next);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(result.consent);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <h2 className="text-base font-medium">{PHOTO_CONSENT_HEADING}</h2>
        {written.map((paragraph, index) => (
          <p key={index} className="app-muted text-sm leading-relaxed">
            {paragraph}
          </p>
        ))}

        {/* What is on the record now, said plainly. Somebody checking whether
            their objection actually stuck is the main reason to open this
            page. */}
        <p className="text-sm">
          {stored === null
            ? PHOTO_OBJECTION_NONE
            : stored
              ? PHOTO_OBJECTION_WITHDRAWN
              : PHOTO_OBJECTION_RECORDED}
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {objecting ? (
          <Button
            variant="outline"
            onClick={() => save(true)}
            disabled={isPending}
            focusableWhenDisabled
          >
            {isPending ? "Saving…" : PHOTO_OBJECTION_WITHDRAW_ACTION}
          </Button>
        ) : (
          <Button
            onClick={() => save(false)}
            disabled={isPending}
            focusableWhenDisabled
          >
            {isPending ? "Saving…" : PHOTO_OBJECTION_ACTION}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
