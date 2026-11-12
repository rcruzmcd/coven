"use client";

import { useMemo } from "react";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import {
  ProgramDetailsDialog,
  type ProgramSocialAccess,
} from "./program-details-dialog";
import {
  ProgramPublicBadge,
  ProgramStatusBadge,
  type ProgramRow,
} from "./program-badges";

export function ProgramsTable({
  programs,
  canManage,
  social,
}: {
  programs: ProgramRow[];
  canManage: boolean;
  social: ProgramSocialAccess;
}) {
  // Rebuilt only when the permission behind the row action changes, which in
  // practice is never within a session.
  const columns = useMemo<PortalDataTableColumn<ProgramRow>[]>(
    () => [
      {
        key: "name",
        label: "Program",
        sortValue: (program) => program.name,
        cellClassName: "font-medium",
        render: (program) => program.name,
      },
      {
        key: "description",
        // Truncated free text: there is nothing a reader would look for in its
        // alphabetical order, so it stays unsorted.
        label: "Description",
        cellClassName: "app-muted max-w-sm truncate",
        render: (program) => program.description || "—",
      },
      {
        key: "status",
        label: "Status",
        sortValue: (program) => program.status,
        render: (program) => <ProgramStatusBadge status={program.status} />,
      },
      {
        key: "is_public",
        label: "Public site",
        hideBelow: "md",
        // Public first when sorted, since the question the column answers is
        // "what is on the website".
        sortValue: (program) => (program.is_public ? 0 : 1),
        render: (program) => (
          <ProgramPublicBadge isPublic={program.is_public} />
        ),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right",
        render: (program) => (
          <ProgramDetailsDialog
            program={program}
            canManage={canManage}
            social={social}
          />
        ),
      },
    ],
    [canManage, social],
  );

  return (
    <PortalDataTable
      columns={columns}
      rows={programs}
      getRowKey={(program) => program.id}
      // The query orders by name, so the arrow starts on the column the list
      // is already sorted by.
      defaultSort={{ key: "name", dir: "asc" }}
      emptyMessage="No programs to show."
    />
  );
}
