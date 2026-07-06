import type { CSSProperties, ReactNode } from "react";
import {
  Bot,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CardProps = {
  children: ReactNode;
  className?: string;
  compact?: boolean;
};

export function Card({ children, className, compact = false }: CardProps) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[8px] border border-slate-200/80 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.055)]",
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
      <div>
        <h2 className="text-[19px] font-bold leading-tight text-slate-950">
          {title}
        </h2>
        {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Pill({
  children,
  tone = "blue",
  className,
}: {
  children: ReactNode;
  tone?: "blue" | "green" | "orange" | "amber" | "gray" | "red";
  className?: string;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    orange: "bg-orange-50 text-orange-700 ring-orange-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    gray: "bg-slate-100 text-slate-600 ring-slate-200",
    red: "bg-red-50 text-red-700 ring-red-200",
  };

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-sm font-semibold ring-1",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PrimaryButton({
  children,
  variant = "solid",
  tone = "blue",
  className,
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  variant?: "solid" | "outline" | "ghost";
  tone?: "blue" | "green" | "orange" | "red";
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const solid = {
    blue: "bg-blue-600 text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)] hover:bg-blue-700",
    green: "bg-emerald-600 text-white shadow-[0_10px_22px_rgba(5,150,105,0.18)] hover:bg-emerald-700",
    orange: "bg-orange-500 text-white shadow-[0_10px_22px_rgba(249,115,22,0.18)] hover:bg-orange-600",
    red: "bg-red-600 text-white shadow-[0_10px_22px_rgba(220,38,38,0.18)] hover:bg-red-700",
  };
  const outline = {
    blue: "border-blue-500 text-blue-700 hover:bg-blue-50",
    green: "border-emerald-500 text-emerald-700 hover:bg-emerald-50",
    orange: "border-orange-400 text-orange-700 hover:bg-orange-50",
    red: "border-red-500 text-red-700 hover:bg-red-50",
  };

  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-[6px] px-5 text-base font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
        variant === "solid" && solid[tone],
        variant === "outline" && "border bg-white " + outline[tone],
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
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
        "h-11 w-full rounded-[6px] border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-100",
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
        "w-full resize-none rounded-[6px] border border-slate-300 bg-white p-3 text-sm leading-7 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-100",
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
        "h-11 w-full rounded-[6px] border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100",
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
          <div className="mb-2 text-sm font-semibold text-slate-500">{eyebrow}</div>
        ) : null}
        <h1 className="text-[32px] font-black leading-tight tracking-[0] text-slate-950">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500">
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
                    done || active ? "bg-blue-600" : "bg-slate-200",
                  )}
                />
              ) : null}
              {index < items.length - 1 ? (
                <div
                  className={cn(
                    "absolute left-1/2 right-0 top-[17px] h-1 translate-x-1/2 rounded-full",
                    done ? "bg-blue-600" : "bg-slate-200",
                  )}
                />
              ) : null}
              <div
                className={cn(
                  "relative z-10 mx-auto grid h-9 w-9 place-items-center rounded-full text-sm font-black",
                  done && "bg-blue-600 text-white",
                  active && "bg-blue-600 text-white ring-4 ring-blue-100",
                  !done && !active && "bg-slate-300 text-white",
                )}
              >
                {done ? <CheckCircle2 size={18} /> : index + 1}
              </div>
              <div className="mt-3 text-sm font-black text-slate-900">{item.label}</div>
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
        <h2 className="inline-flex items-center gap-2 text-xl font-black">
          <Sparkles className="text-blue-600" size={20} /> {title}
        </h2>
        {action}
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div className="flex gap-3 text-sm leading-7" key={item}>
            <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
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
        <div className="font-black">{title}</div>
        <div className="mt-1 text-sm text-slate-500">{rule}</div>
      </div>
      <div className="truncate text-sm font-semibold text-slate-700">
        {file ?? "点击上传或拖拽文件"}
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
        <CheckCircle2 size={15} /> {status}
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
              "mt-1 h-3 w-3 rounded-full",
              index === 0 ? "bg-emerald-500" : "bg-slate-300",
            )}
          />
          {index < items.length - 1 ? (
            <div className="absolute left-[5px] top-6 h-10 w-px bg-slate-200" />
          ) : null}
          <div>
            <div className="text-sm font-bold text-slate-900">
              {item.time ? `${item.time}　` : null}
              {item.actor} {item.action}
            </div>
            {item.detail ? <div className="mt-1 text-sm text-slate-500">{item.detail}</div> : null}
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
    <div className="space-y-3">
      {resources.map((resource) => (
        <button
          className="flex w-full items-center gap-3 rounded-[8px] border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
          key={resource.title}
          type="button"
        >
          <FileBadge type={resource.type} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-slate-900">
              {resource.title}
            </span>
            <span className="mt-1 block text-xs text-slate-500">{resource.meta}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="grid place-items-center rounded-[8px] border border-dashed border-slate-300 bg-slate-50/70 py-10 text-center text-sm text-slate-500">
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
            <td className="p-3 font-black text-blue-700">{row.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ProgressBar({
  value,
  tone = "blue",
  className,
}: {
  value: number;
  tone?: "blue" | "green" | "orange" | "red" | "slate";
  className?: string;
}) {
  const colors = {
    blue: "bg-blue-600",
    green: "bg-emerald-500",
    orange: "bg-amber-400",
    red: "bg-red-500",
    slate: "bg-slate-400",
  };

  return (
    <div className={cn("h-2.5 rounded-full bg-slate-200", className)}>
      <div
        className={cn("h-full rounded-full", colors[tone])}
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
}

export function CircularProgress({
  value,
  label,
  size = 128,
  tone = "#2563eb",
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
      className="grid place-items-center rounded-full bg-[conic-gradient(var(--tone)_var(--progress),#e8ecf3_0)] p-2"
      style={style}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-white text-center">
        <div>
          <div className="text-[30px] font-black leading-none text-slate-950">
            {value}%
          </div>
          {label ? (
            <div className="mt-2 text-sm font-medium text-slate-600">
              {label}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Metric({
  icon,
  label,
  value,
  helper,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  helper?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {icon ? (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
          {icon}
        </div>
      ) : null}
      <div className="min-w-0">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
        {helper ? <div className="text-xs text-slate-400">{helper}</div> : null}
      </div>
    </div>
  );
}

export function FileBadge({ type }: { type: string }) {
  const tone =
    type === "PDF"
      ? "bg-red-500"
      : type === "XLSX"
        ? "bg-emerald-600"
        : type === "PPTX"
          ? "bg-orange-500"
          : type === "MP4"
            ? "bg-violet-600"
            : "bg-blue-600";

  return (
    <span
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-[6px] text-[11px] font-black text-white",
        tone,
      )}
    >
      {type}
    </span>
  );
}
