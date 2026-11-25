import type { ReceivingStatus } from "@/lib/domain/status";

export function StatusBadge({ status, large = false }: { status: ReceivingStatus; large?: boolean }) {
  return (
    <span className={`badge badge-${status.state.toLowerCase().replace(/_/g, "-")}${large ? " badge-large" : ""}`}>
      {status.label}
    </span>
  );
}
