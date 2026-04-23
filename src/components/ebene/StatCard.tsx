import { ReactNode } from "react";

type Tone = "success" | "destructive" | "info" | "purple" | "warning";

interface Props {
  label: string;
  value: string;
  tone: Tone;
  hint?: string;
  icon?: ReactNode;
}

const toneClass: Record<Tone, string> = {
  success: "stat-success",
  destructive: "stat-destructive",
  info: "stat-info",
  purple: "stat-purple",
  warning: "stat-warning",
};

const valueColor: Record<Tone, string> = {
  success: "text-success",
  destructive: "text-destructive",
  info: "text-info",
  purple: "text-purple",
  warning: "text-warning",
};

export const StatCard = ({ label, value, tone, hint, icon }: Props) => (
  <div className={`stat-card ${toneClass[tone]}`}>
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
      {icon}
    </div>
    <p className={`amount text-xl sm:text-2xl mt-1 ${valueColor[tone]}`}>{value}</p>
    {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
  </div>
);