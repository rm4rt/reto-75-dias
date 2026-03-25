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

function relativeLabel(createdAt: string): string {
  const diffDays = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  return `Hace ${diffDays} días`;
}

export default function TrackingPage() {
  const { weight, startWeight, goalWeight, updateWeight, addDay, day } = useAppStore();
  const { user } = useUser();
  const [entries, setEntries] = useState<WeightEntry[]>([]);

  useEffect(() => {
    const fetchEntries = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("weight_entries")
        .select("*")
        .eq("clerk_user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[Supabase] weight_entries fetch failed:", error);
        return;
      }
      setEntries(data ?? []);
    };
    fetchEntries();
  }, [user?.id]);

  const chartData = entries.map((e) => ({
    day: e.day,
    weight: Number(e.weight),
  }));

  const recentEntries = [...entries].reverse().slice(0, 4);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Seguimiento</h1>
        <p className="mt-1 text-sm text-white/60">
          Controla tu peso, tu avance y tu actividad reciente.
        </p>
      </div>

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
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.9)",
                  }}
                  formatter={(v: number) => [`${v} kg`, "Peso"]}
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

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-white/60">Historial reciente</p>

        <div className="mt-4 flex flex-col gap-3">
          {recentEntries.length === 0 ? (
            <p className="text-xs text-white/40">
              Aún no hay registros. Usa el check-in de peso en el dashboard.
            </p>
          ) : (
            recentEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <p className="text-sm font-semibold text-white/90">
                  {Number(entry.weight).toFixed(1)} kg
                </p>
                <p className="text-xs text-white/60">
                  {relativeLabel(entry.created_at)} · Día {entry.day}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-white/60">Ayuno</p>
        <div className="mt-4">
          <p className="text-3xl font-bold text-white/90">14h 32m</p>
          <p className="mt-1 text-sm text-white/60">En curso</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-white/60">Acciones rápidas</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            className="rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-black shadow-lg transition hover:scale-[1.02]"
            onClick={() => updateWeight(weight - 0.5)}
          >
            -0.5 kg
          </button>

          <button
            className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-semibold text-white transition hover:bg-white/20 hover:scale-[1.02]"
            onClick={() => addDay()}
          >
            Día {day + 1}
          </button>
        </div>
      </div>
    </section>
  );
}
