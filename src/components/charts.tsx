"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const lineData = [
  { month: "2023-11", value: 56 },
  { month: "2023-12", value: 42 },
  { month: "2024-01", value: 55 },
  { month: "2024-02", value: 43 },
  { month: "2024-03", value: 56 },
  { month: "2024-04", value: 74 },
];

const barData = [
  { name: "碳中和概念", value: 82 },
  { name: "碳排放计算", value: 76 },
  { name: "清洁能源", value: 68 },
  { name: "碳捕集技术", value: 62 },
  { name: "循环经济", value: 55 },
  { name: "可持续发展策略", value: 48 },
];

export function EnergyLineChart() {
  return (
    <div className="h-[118px] w-full">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={lineData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" fontSize={11} tickLine={false} />
          <YAxis fontSize={11} tickLine={false} />
          <Tooltip />
          <Line
            dataKey="value"
            dot={{ r: 4, strokeWidth: 2 }}
            stroke="#2563eb"
            strokeWidth={3}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MasteryBarChart() {
  return (
    <div className="h-[155px] w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={barData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" fontSize={12} tickLine={false} />
          <YAxis fontSize={12} tickFormatter={(v) => `${v}%`} tickLine={false} />
          <Tooltip />
          <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type EvaluationRadarDatum = { subject: string; value: number };

export function EvaluationRadar({ data }: { data: EvaluationRadarDatum[] }) {
  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer height="100%" width="100%">
        <RadarChart data={data} outerRadius={92}>
          <PolarGrid stroke="#dbeafe" />
          <PolarAngleAxis dataKey="subject" fontSize={13} />
          <Radar
            dataKey="value"
            fill="#3b82f6"
            fillOpacity={0.18}
            stroke="#2563eb"
            strokeWidth={3}
          />
          <Tooltip />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
