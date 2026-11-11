"use client";

import {
  DrivePicker,
  DrivePickerDocsView,
} from "@googleworkspace/drive-picker-react";
import type { PickedDriveDoc } from "@/lib/storage/google-drive";

/**
 * The Picker itself. Its own file because the element registers a custom
 * element at import, which cannot run on the server: the popup loads this
 * with `ssr: false`. The token is passed in, so the element never opens a
 * Google sign-in window of its own.
 */
export default function DrivePickerDialog({
  appId,
  apiKey,
  accessToken,
  mimeTypes,
  multiple,
  onPicked,
  onCanceled,
}: {
  appId: string;
  apiKey: string;
  accessToken: string;
  mimeTypes: string | null;
  multiple: boolean;
  onPicked: (docs: PickedDriveDoc[]) => void;
  onCanceled: () => void;
}) {
  return (
    <DrivePicker
      app-id={appId}
      developer-key={apiKey}
      oauth-token={accessToken}
      multiselect={multiple}
      title="Choose from Google Drive"
      onPicked={(event) => onPicked(event.detail.docs ?? [])}
      onCanceled={onCanceled}
    >
      <DrivePickerDocsView
        enable-drives="true"
        include-folders="true"
        {...(mimeTypes ? { "mime-types": mimeTypes } : {})}
      />
    </DrivePicker>
  );
}
