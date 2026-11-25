/** Terminal times are shown in Houston local time (America/Chicago). */
const HOUSTON = "America/Chicago";

const dateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: HOUSTON,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatHouston(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateTime.format(new Date(iso));
}

export function formatAgo(iso: string, now: Date = new Date()): string {
  const mins = Math.round((now.getTime() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
