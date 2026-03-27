"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAppStore } from "@/app/store/useAppStore";
import supabase from "@/lib/supabaseClient";

export default function ProfileSync() {
  const { user } = useUser();
  const { day, weight, startWeight, goalWeight, setProfileData } = useAppStore();
  const [hasLoaded, setHasLoaded] = useState(false);

  // Init + load profile from Supabase on mount
  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("clerk_user_id")
        .eq("clerk_user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[ProfileSync] lookup failed:", error);
        return;
      }

      if (!data) {
        const { error: insertError } = await supabase
          .from("profiles")
          .insert({
            clerk_user_id: user.id,
            day: 1,
            weight: 80,
            start_weight: 80,
            goal_weight: 75,
          });
        if (insertError) {
          console.error("[ProfileSync] insert failed:", insertError);
        }
      }

      const { data: fullRow, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("clerk_user_id", user.id)
        .maybeSingle();

      if (fetchError || !fullRow) return;

      setProfileData({
        day: Number(fullRow.day),
        weight: Number(fullRow.weight),
        startWeight: Number(fullRow.start_weight),
        goalWeight: Number(fullRow.goal_weight),
      });

      setHasLoaded(true);
    };

    run();
  }, [user?.id]);

  // Auto-save store changes back to Supabase
  useEffect(() => {
    const save = async () => {
      if (!user?.id || !hasLoaded) return;
      await supabase
        .from("profiles")
        .update({
          day: Number(day),
          weight: Number(weight),
          start_weight: Number(startWeight),
          goal_weight: Number(goalWeight),
        })
        .eq("clerk_user_id", user.id);
    };
    save();
  }, [user?.id, hasLoaded, day, weight, startWeight, goalWeight]);

  return null;
}
