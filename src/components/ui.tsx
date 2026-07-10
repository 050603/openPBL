import type { CSSProperties, ReactNode } from "react";
import {
  Bot,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
   OpenPBL 基础组件库 v2
   - 统一圆角（8/12/16）
   - 语义化变体
   - 克制字重（去除 font-black 滥用，最多到 font-bold）
   - 身份色通过 role 传入
   ============================================================ */

type Role = "teacher" | "student" | "ai";

type CardProps = {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  raised?: boolean;
};

export function Card({ children, className, compact = false, raised = false }: CardProps) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[var(--radius-md)]",
        raised ? "pbl-card-raised" : "pbl-card",
        compact ? "p-4" : "p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  title,
  action,
  hint,
}: {
  title: string;
  action?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[18px] font-bold leading-tight text-slate-900">
          {title}
        </h2>
        {hint ? <p className="mt-1 text-[13px] text-slate-500">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type PillTone = "blue" | "green" | "orange" | "amber" | "gray" | "red" | "teal" | "indigo";

export function Pill({
  children,
  tone = "blue",
  className,
  size = "md",
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
  size?: "sm" | "md";
}) {
  const tones: Record<PillTone, string> = {
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    teal: "bg-teal-50 text-teal-700 ring-teal-200",
    orange: "bg-orange-50 text-orange-700 ring-orange-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    gray: "bg-slate-100 text-slate-600 ring-slate-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  const sizes = {
    sm: "h-6 px-2.5 text-xs",
    md: "h-7 px-3 text-[13px]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold ring-1",
        tones[tone],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* 状态徽章：用语义色而非任意色块 */
export function StatusPill({
  status,
  label,
}: {
  status: "draft" | "preparing" | "ready" | "teaching" | "finished";
  label: string;
}) {
  const toneMap: Record<typeof status, PillTone> = {
    draft: "gray",
    preparing: "amber",
    ready: "green",
    teaching: "indigo",
    finished: "gray",
  };
  return (
    <Pill tone={toneMap[status]} size="sm">
      {label}
    </Pill>
  );
}

type ButtonTone = "blue" | "green" | "orange" | "red" | "indigo" | "teal" | "slate";

export function PrimaryButton({
  children,
  variant = "solid",
  tone = "blue",
  className,
  type = "button",
  disabled,
  onClick,
  size = "md",
}: {
  children: ReactNode;
  variant?: "solid" | "outline" | "ghost";
  tone?: ButtonTone;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  size?: "sm" | "md" | "lg";
}) {
  const solid: Record<ButtonTone, string> = {
    blue: "bg-blue-600 text-white hover:bg-blue-700",
    indigo: "bg-indigo-700 text-white hover:bg-indigo-800",
    teal: "bg-teal-600 text-white hover:bg-teal-700",
    green: "bg-emerald-600 text-white hover:bg-emerald-700",
    orange: "bg-orange-500 text-white hover:bg-orange-600",
    red: "bg-rose-600 text-white hover:bg-rose-700",
    slate: "bg-slate-800 text-white hover:bg-slate-900",
  };
  const outline: Record<ButtonTone, string> = {
    blue: "border-blue-500 text-blue-700 hover:bg-blue-50",
    indigo: "border-indigo-500 text-indigo-700 hover:bg-indigo-50",
    teal: "border-teal-500 text-teal-700 hover:bg-teal-50",
    green: "border-emerald-500 text-emerald-700 hover:bg-emerald-50",
    orange: "border-orange-400 text-orange-700 hover:bg-orange-50",
    red: "border-rose-500 text-rose-700 hover:bg-rose-50",
    slate: "border-slate-400 text-slate-700 hover:bg-slate-50",
  };
  const sizes = {
    sm: "h-9 px-3.5 text-[13px]",
    md: "h-11 px-5 text-sm",
    lg: "h-12 px-6 text-base",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55",
        variant === "solid" && solid[tone],
        variant === "outline" && "border bg-white " + outline[tone],
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        sizes[size],
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[var(--radius-sm)] border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
        className,
      )}
      {...props}
    />
  );
}

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-[var(--radius-sm)] border border-slate-300 bg-white p-3 text-sm leading-7 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-[var(--radius-sm)] border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-5">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StageTimeline({
  items,
  currentIndex,
}: {
  items: { label: string; description?: string }[];
  currentIndex: number;
}) {
  return (
    <Card className="px-6 py-5">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <div className="relative text-center" key={item.label}>
              {index > 0 ? (
                <div
                  className={cn(
                    "absolute left-0 right-1/2 top-[17px] h-1 -translate-x-1/2 rounded-full",
                    done || active ? "bg-indigo-600" : "bg-slate-200",
                  )}
                />
              ) : null}
              {index < items.length - 1 ? (
                <div
                  className={cn(
                    "absolute left-1/2 right-0 top-[17px] h-1 translate-x-1/2 rounded-full",
                    done ? "bg-indigo-600" : "bg-slate-200",
                  )}
                />
              ) : null}
              <div
                className={cn(
                  "relative z-10 mx-auto grid h-9 w-9 place-items-center rounded-full text-sm font-bold",
                  done && "bg-indigo-600 text-white",
                  active && "bg-indigo-600 text-white ring-4 ring-indigo-100",
                  !done && !active && "bg-slate-300 text-white",
                )}
              >
                {done ? <CheckCircle2 size={18} /> : index + 1}
              </div>
              <div className="mt-3 text-sm font-bold text-slate-900">{item.label}</div>
              {item.description ? (
                <div className="mt-1 text-xs text-slate-500">{item.description}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function AIAdvicePanel({
  title = "AI建议",
  items,
  action,
}: {
  title?: string;
  items: string[];
  action?: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold">
          <Bot className="text-sky-600" size={18} /> {title}
        </h2>
        {action}
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div className="flex gap-3 text-sm leading-6" key={item}>
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-50 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
              {index + 1}
            </span>
            <p className="text-slate-700">{item}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function UploadRow({
  type,
  title,
  rule,
  file,
  status = "已上传",
}: {
  type: string;
  title: string;
  rule: string;
  file?: string;
  status?: string;
}) {
  return (
    <div className="grid grid-cols-[52px_1fr_1fr_96px] items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0">
      <FileBadge type={type} />
      <div>
        <div className="font-bold text-slate-900">{title}</div>
        <div className="mt-1 text-[13px] text-slate-500">{rule}</div>
      </div>
      <div className="truncate text-[13px] font-medium text-slate-700">
        {file ?? "点击上传或拖拽文件"}
      </div>
      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-600">
        <CheckCircle2 size={14} /> {status}
      </span>
    </div>
  );
}

export function ActivityFeed({
  items,
}: {
  items: { id?: string; time?: string; actor: string; action: string; detail?: string }[];
}) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div className="relative flex gap-3" key={item.id ?? `${item.actor}-${index}`}>
          <span
            className={cn(
              "mt-1.5 h-2.5 w-2.5 rounded-full",
              index === 0 ? "bg-emerald-500" : "bg-slate-300",
            )}
          />
          {index < items.length - 1 ? (
            <div className="absolute left-[4px] top-6 h-8 w-px bg-slate-200" />
          ) : null}
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-900">
              {item.time ? `${item.time}　` : null}
              {item.actor} {item.action}
            </div>
            {item.detail ? <div className="mt-1 text-[13px] text-slate-500">{item.detail}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResourceList({
  resources,
}: {
  resources: { type: string; title: string; meta: string }[];
}) {
  return (
    <div className="space-y-2">
      {resources.map((resource) => (
        <button
          className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
          key={resource.title}
          type="button"
        >
          <FileBadge type={resource.type} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">
              {resource.title}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">{resource.meta}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="pbl-dot-grid grid place-items-center rounded-[var(--radius-sm)] border border-dashed border-slate-300 bg-slate-50/40 py-10 text-center text-sm text-slate-500">
      <Bot className="mb-2 text-slate-400" size={22} />
      {text}
    </div>
  );
}

export function RubricScoreTable({
  rows,
}: {
  rows: { name: string; weight: number; score: number }[];
}) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead className="bg-slate-50 text-slate-500">
        <tr>
          <th className="p-3 font-semibold">评分维度</th>
          <th className="p-3 font-semibold">权重</th>
          <th className="p-3 font-semibold">得分</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr className="border-b border-slate-100 last:border-b-0" key={row.name}>
            <td className="p-3 font-semibold text-slate-800">{row.name}</td>
            <td className="p-3 text-slate-500">{row.weight}%</td>
            <td className="p-3 font-bold text-indigo-700">{row.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type ProgressTone = "blue" | "green" | "orange" | "red" | "slate" | "indigo" | "teal";

export function ProgressBar({
  value,
  tone = "indigo",
  className,
}: {
  value: number;
  tone?: ProgressTone;
  className?: string;
}) {
  const colors: Record<ProgressTone, string> = {
    blue: "bg-blue-600",
    indigo: "bg-indigo-600",
    teal: "bg-teal-600",
    green: "bg-emerald-500",
    orange: "bg-amber-400",
    red: "bg-rose-500",
    slate: "bg-slate-400",
  };

  return (
    <div className={cn("h-2 rounded-full bg-slate-200", className)}>
      <div
        className={cn("h-full rounded-full transition-all", colors[tone])}
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
}

export function CircularProgress({
  value,
  label,
  size = 128,
  tone = "#4338ca",
}: {
  value: number;
  label?: string;
  size?: number;
  tone?: string;
}) {
  const style = {
    "--progress": `${value * 3.6}deg`,
    "--tone": tone,
    width: size,
    height: size,
  } as CSSProperties;

  return (
    <div
      className="grid place-items-center rounded-full bg-[conic-gradient(var(--tone)_var(--progress),#e8ecf3_0)] p-1.5"
      style={style}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-white text-center">
        <div>
          <div className="text-[28px] font-bold leading-none text-slate-900">
            {value}%
          </div>
          {label ? (
            <div className="mt-1.5 text-[13px] font-medium text-slate-500">
              {label}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* 指标卡：用于仪表盘统计 */
export function Metric({
  icon,
  label,
  value,
  helper,
  tone = "indigo",
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  helper?: string;
  tone?: "indigo" | "teal" | "amber" | "rose" | "slate";
}) {
  const toneMap = {
    indigo: "bg-indigo-50 text-indigo-700",
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="flex min-w-0 items-center gap-3">
      {icon ? (
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-sm)]", toneMap[tone])}>
          {icon}
        </div>
      ) : null}
      <div className="min-w-0">
        <div className="text-[13px] text-slate-500">{label}</div>
        <div className="mt-0.5 text-xl font-bold text-slate-900">{value}</div>
        {helper ? <div className="text-xs text-slate-400">{helper}</div> : null}
      </div>
    </div>
  );
}

export function FileBadge({ type }: { type: string }) {
  const tone =
    type === "PDF"
      ? "bg-rose-500"
      : type === "XLSX"
        ? "bg-emerald-600"
        : type === "PPTX"
          ? "bg-orange-500"
          : type === "MP4"
            ? "bg-violet-600"
            : "bg-indigo-600";

  return (
    <span
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[11px] font-bold text-white",
        tone,
      )}
    >
      {type}
    </span>
  );
}

/* 角色色辅助：返回当前角色应使用的主色 token */
export function roleColor(role: Role): string {
  return role === "teacher" ? "var(--pbl-teacher)" : role === "student" ? "var(--pbl-student)" : "var(--pbl-ai)";
}
