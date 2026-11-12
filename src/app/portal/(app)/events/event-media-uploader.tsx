"use client";

import { useState } from "react";
import { MediaUploader } from "@/components/event-media/media-uploader";
import { createVideoUpload, uploadEventPhoto } from "@/lib/storage/event-media";
import type { EventMediaQueueDeps } from "@/lib/storage/event-media-queue";
import {
  createEventMediaUploadSlotsAction,
  recordEventMediaAction,
} from "./media-actions";

/**
 * The event Media card's uploader (#1606): signed in, slots minted with the
 * uploader's own session, photos resized to 2048px.
 */
export function EventMediaUploader({
  eventId,
  onUploaded,
}: {
  eventId: string;
  onUploaded?: () => void;
}) {
  const [deps] = useState<EventMediaQueueDeps>(() => ({
    mintSlots: (files) => createEventMediaUploadSlotsAction(eventId, files),
    uploadPhoto: uploadEventPhoto,
    createVideoUpload,
    record: (slot, name) => recordEventMediaAction(slot.path, name),
  }));

  return (
    <MediaUploader
      deps={deps}
      onUploaded={onUploaded}
      googleDrive
      clearWhenDone
      hint="Photos are resized before upload. Videos up to 10 GB; keep this page open until they finish."
    />
  );
}
