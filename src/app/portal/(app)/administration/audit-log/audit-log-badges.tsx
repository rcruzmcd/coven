import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";

export const TABLE_LABELS: Record<string, string> = {
  donations: "Donations",
  inventory_items: "Inventory items",
  inventory_movements: "Inventory movements",
  events: "Events",
  event_expenses: "Event expenses",
  user_roles: "User roles",
  app_settings: "App settings",
  calendar_items: "Calendar items",
  content_opportunities: "Social posts",
  social_post_tags: "Social post tags",
  social_post_media: "Social post media",
  services: "Services",
  assets: "Assets",
  access_grants: "Access grants",
  people: "People",
};

const ACTION_STYLES: Record<string, StatusTone> = {
  insert: "info",
  update: "progress",
  delete: "danger",
};

export function ActionBadge({ action }: { action: string }) {
  return (
    <StatusBadge tone={ACTION_STYLES[action] ?? "neutral"}>
      {humanizeStatus(action)}
    </StatusBadge>
  );
}
