export type StatusTone = "success" | "warning" | "danger" | "neutral";

const DANGER = ["critical", "cancelled", "canceled", "failed", "delayed", "error"];
const WARNING = ["watch", "warning", "pending", "processing", "pre-accepted"];
const SUCCESS = ["healthy", "completed", "delivered", "received", "accepted", "active", "post-accepted"];

/** Keyword match against the known status vocabulary used across the dashboard's tables (delay severity, order status). */
export function statusToneFor(value: string): StatusTone {
  const v = value.toLowerCase();
  if (DANGER.some((w) => v.includes(w))) return "danger";
  if (WARNING.some((w) => v.includes(w))) return "warning";
  if (SUCCESS.some((w) => v.includes(w))) return "success";
  return "neutral";
}
