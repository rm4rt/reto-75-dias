"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAppStore } from "@/app/store/useAppStore";
import supabase from "@/lib/supabaseClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type WeightEntry = {
  id: string;
  weight: number;
  day: number;
  created_at: string;
};

type FastingSession = {
  id: string;
  start_time: string;
  end_time: string;
  duration_hours: number | null;
  target_hours: number;
};

type TimelineItem = {
  key: string;
  dateISO: string;
  dateLabel: string;
  type: "weight" | "fasting";
  label: string;
  meta?: string;
};

export default function TrackingPage() {
  const { weight, startWeight, goalWeight } = useAppStore();
  const { user } = useUser();
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;

      const [{ data: weightData }, { data: fastingData }] = await Promise.all([
        supabase
          .from("weight_entries")
          .select("*")
          .eq("clerk_user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("fasting_sessions")
          .select("id, start_time, end_time, duration_hours, target_hours")
          .eq("clerk_user_id", user.id)
          .not("end_time", "is", null)
          .order("end_time", { ascending: false })
          .limit(30),
      ]);

      setEntries(weightData ?? []);

      // Build combined timeline
      const items: TimelineItem[] = [];

      for (const w of weightData ?? []) {
        const d = new Date(w.created_at);
        items.push({
          key: `w-${w.id}`,
          dateISO: w.created_at,
          dateLabel: d.toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }),
          type: "weight",
          label: `Peso registrado: ${Number(w.weight).toFixed(1)} kg`,
          meta: d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
        });
      }

      for (const f of fastingData ?? []) {
        const d = new Date(f.end_time);
        const goalMet = (f.duration_hours ?? 0) >= f.target_hours;
        items.push({
          key: `f-${f.id}`,
          dateISO: f.end_time,
          dateLabel: d.toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }),
          type: "fasting",
          label: `Ayuno ${(f.duration_hours ?? 0).toFixed(1)}h${goalMet ? " completado" : ""}`,
          meta: goalMet ? "✓" : undefined,
        });
      }

      // Sort descending by date
      items.sort((a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime());
      setTimeline(items.slice(0, 30));
    };

    fetchData();
  }, [user?.id]);

  const chartData = entries.map((e) => ({
    day: e.day,
    weight: Number(e.weight),
  }));

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Historial</h1>
        <p className="mt-1 text-sm text-white/60">
          Evolución de tu peso y actividad reciente.
        </p>
      </div>

      {/* Weight stats */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-white/60">Peso actual</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Actual</p>
            <p className="mt-1 text-xl font-bold">{weight} kg</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Inicio</p>
            <p className="mt-1 text-xl font-bold">{startWeight} kg</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Meta</p>
            <p className="mt-1 text-xl font-bold">{goalWeight} kg</p>
          </div>
        </div>
      </div>

      {/* Weight chart */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-white/60">Evolución de peso</p>
        {chartData.length < 2 ? (
          <p className="mt-4 text-xs text-white/40">
            Registra al menos 2 pesos para ver la gráfica.
          </p>
        ) : (
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `D${v}`}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.9)",
                  }}
                  formatter={(v) => [v != null ? `${v} kg` : "—", "Peso"]}
                  labelFormatter={(l) => `Día ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "white", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Combined timeline */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-white/60">Actividad reciente</p>

        <div className="mt-4 flex flex-col gap-2">
          {timeline.length === 0 ? (
            <p className="text-xs text-white/40">
              Aún no hay actividad registrada.
            </p>
          ) : (
            <>
              {(showAll ? timeline : timeline.slice(0, 5)).map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs text-white/60">
                    {item.type === "fasting" ? "⏱" : "⚖"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white/85">{item.label}</p>
                    <p className="text-xs text-white/40">
                      {item.dateLabel}
                      {item.meta && item.type === "weight" ? ` · ${item.meta}` : ""}
                    </p>
                  </div>
                  {item.type === "fasting" && item.meta === "✓" && (
                    <span className="shrink-0 text-xs text-green-400">{item.meta}</span>
                  )}
                </div>
              ))}

              {!showAll && timeline.length > 5 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-xs font-medium text-white/50 transition hover:bg-white/[0.06] hover:text-white/70"
                >
                  Ver historial completo ({timeline.length} registros)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
