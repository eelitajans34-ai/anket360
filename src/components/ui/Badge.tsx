import { STATUS_LABEL, STATUS_STYLE } from "@/lib/constants";
import type { SurveyStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: SurveyStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}
