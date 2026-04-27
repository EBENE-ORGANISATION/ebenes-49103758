export type HeaderFeature =
  | "alertes"
  | "recap_annuel"
  | "archives"
  | "json_io"
  | "users_admin"
  | "audit_log";

export const HEADER_FEATURES: HeaderFeature[] = [
  "alertes",
  "recap_annuel",
  "archives",
  "json_io",
  "users_admin",
  "audit_log",
];

export const HEADER_FEATURE_LABELS: Record<HeaderFeature, string> = {
  alertes: "🔔 Alertes (cloche)",
  recap_annuel: "📊 Récap Annuel",
  archives: "🗂️ Archives",
  json_io: "💾 Exporter / Importer JSON",
  users_admin: "👥 Gestion utilisateurs",
  audit_log: "🕘 Journal d'audit",
};
