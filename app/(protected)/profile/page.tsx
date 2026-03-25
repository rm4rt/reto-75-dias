"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAppStore } from "@/app/store/useAppStore";
import supabase from "@/lib/supabaseClient";

function getBmiCategory(bmi: number): {
  label: string;
  color: string;
  message: string;
} {
  if (bmi < 18.5)
    return {
      label: "Bajo peso",
      color: "text-white/60",
      message: "Tu peso está por debajo del rango habitual.",
    };
  if (bmi < 25)
    return {
      label: "Normal",
      color: "text-green-400",
      message: "Estás dentro del rango habitual.",
    };
  if (bmi < 30)
    return {
      label: "Sobrepeso",
      color: "text-yellow-400",
      message: "Hay margen de mejora si tu objetivo es recomposición.",
    };
  return {
    label: "Obesidad",
    color: "text-red-400",
    message: "Tu punto de partida requiere constancia y progresión.",
  };
}

export default function ProfilePage() {
  const { user } = useUser();
  const {
    startWeight,
    goalWeight,
    day,
    weight,
    heightCm,
    updateStartWeight,
    updateGoalWeight,
    updateHeightCm,
    setDay,
  } = useAppStore();

  const [localStartWeight, setLocalStartWeight] = useState(startWeight);
  const [localGoalWeight, setLocalGoalWeight] = useState(goalWeight);
  const [localDay, setLocalDay] = useState(day);
  const [localHeightCm, setLocalHeightCm] = useState(heightCm);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!user?.id) {
      setError("Usuario no autenticado.");
      return;
    }
    if (!localDay || localDay < 1 || localDay > 75) {
      setError("El día debe estar entre 1 y 75.");
      return;
    }
    if (!localStartWeight || !localGoalWeight) {
      setError("Los pesos no pueden estar vacíos.");
      return;
    }
    if (!localHeightCm || localHeightCm < 100 || localHeightCm > 250) {
      setError("La altura debe estar entre 100 y 250 cm.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error: supabaseError } = await supabase
      .from("profiles")
      .update({
        start_weight: Number(localStartWeight),
        goal_weight: Number(localGoalWeight),
        day: Number(localDay),
        height_cm: Number(localHeightCm),
      })
      .eq("clerk_user_id", user.id);

    if (supabaseError) {
      setError(`Error al guardar: ${supabaseError.message}`);
      setSaving(false);
      return;
    }

    updateStartWeight(localStartWeight);
    updateGoalWeight(localGoalWeight);
    setDay(localDay);
    updateHeightCm(localHeightCm);

    setSuccess(true);
    setSaving(false);
  };

  const heightM = localHeightCm / 100;
  const bmi = heightM > 0 ? localStartWeight / (heightM * heightM) : null;
  const bmiCategory = bmi !== null ? getBmiCategory(bmi) : null;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="mt-1 text-sm text-white/60">
          Configura tu punto de partida para que el reto refleje tu progreso real.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs text-white/60">Peso inicial (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              value={localStartWeight}
              onChange={(e) => setLocalStartWeight(Number(e.target.value))}
              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-white/60">Peso meta (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              value={localGoalWeight}
              onChange={(e) => setLocalGoalWeight(Number(e.target.value))}
              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-white/60">Altura (cm)</span>
            <input
              type="number"
              inputMode="numeric"
              min={100}
              max={250}
              value={localHeightCm}
              onChange={(e) => setLocalHeightCm(Number(e.target.value))}
              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-white/60">Día actual del reto</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={75}
              value={localDay}
              onChange={(e) => setLocalDay(Number(e.target.value))}
              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
            />
          </label>
        </div>

        {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
        {success && (
          <p className="mt-4 text-xs text-green-400">Configuración guardada.</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:scale-[1.01] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>

      {bmi !== null && bmiCategory !== null && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            Estado corporal
          </p>
          <div className="mt-3 flex items-end gap-3">
            <p className="text-5xl font-bold">{bmi.toFixed(1)}</p>
            <p className={`mb-1 text-lg font-semibold ${bmiCategory.color}`}>
              {bmiCategory.label}
            </p>
          </div>
          <p className="mt-2 text-sm text-white/60">{bmiCategory.message}</p>
          <p className="mt-4 text-xs text-white/30">
            La estimación de grasa corporal requiere más datos y se añadirá más adelante.
          </p>
        </div>
      )}
    </section>
  );
}
