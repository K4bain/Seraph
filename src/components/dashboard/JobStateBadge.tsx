import { Badge } from "@/components/ui/badge";
import { CircleDot } from "lucide-react";

export function JobStateBadge({ state }: { state: string }) {
  const variant =
    state === "completed"
      ? "default"
      : state === "failed"
        ? "destructive"
        : state === "active"
          ? "outline"
          : "secondary";
  const tone =
    state === "completed"
      ? "text-emerald-400"
      : state === "failed"
        ? ""
        : state === "active"
          ? "text-primary"
          : "";
  return (
    <Badge variant={variant} className={`gap-1.5 font-mono text-[10px] uppercase tracking-wider ${tone}`}>
      <CircleDot className="size-2.5" />
      {state}
    </Badge>
  );
}
