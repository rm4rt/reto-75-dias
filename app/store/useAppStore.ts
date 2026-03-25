"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type State = {
  day: number;
  weight: number;
  startWeight: number;
  goalWeight: number;
  heightCm: number;
};

type Actions = {
  addDay: () => void;
  setDay: (d: number) => void;
  updateWeight: (w: number) => void;
  updateStartWeight: (w: number) => void;
  updateGoalWeight: (w: number) => void;
  updateHeightCm: (h: number) => void;
  setProfileData: (data: {
    day: number;
    weight: number;
    startWeight: number;
    goalWeight: number;
  }) => void;
};

export const useAppStore = create<State & Actions>()(
  persist(
    (set) => ({
      day: 14,
      weight: 78,
      startWeight: 85,
      goalWeight: 75,
      heightCm: 170,

      addDay: () =>
        set((state) => ({
          day: state.day + 1,
        })),

      setDay: (d) => set(() => ({ day: d })),

      updateWeight: (w) =>
        set(() => ({
          weight: w,
        })),

      updateStartWeight: (w) =>
        set(() => ({
          startWeight: w,
        })),

      updateGoalWeight: (w) =>
        set(() => ({
          goalWeight: w,
        })),

      updateHeightCm: (h) =>
        set(() => ({
          heightCm: h,
        })),

      setProfileData: (data) =>
        set(() => ({
          day: data.day,
          weight: data.weight,
          startWeight: data.startWeight,
          goalWeight: data.goalWeight,
        })),
    }),
    {
      name: "reto-75-dias-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        day: state.day,
        weight: state.weight,
        startWeight: state.startWeight,
        goalWeight: state.goalWeight,
        heightCm: state.heightCm,
      }),
    }
  )
);