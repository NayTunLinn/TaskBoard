import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { resetDirectoryAccess, refreshDirectoryAccess } from "@/lib/directory-store";
import { resetTaskAccess, refreshTaskAccess } from "@/lib/task-store";

export type AuthState = { loading: boolean; user: User | null; isAdmin: boolean };

let cache: AuthState = { loading: true, user: null, isAdmin: false };
let started = false;
const listeners = new Set<(s: AuthState) => void>();

function set(next: AuthState) {
  cache = next;
  for (const l of listeners) l(cache);
}

async function load() {
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;
  if (cache.user?.id !== user?.id) {
    resetDirectoryAccess();
    resetTaskAccess();
    await Promise.all([refreshDirectoryAccess(), refreshTaskAccess()]);
  }
  let isAdmin = false;
  if (user) {
    const { data: rows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    isAdmin = (rows ?? []).length > 0;
  }
  set({ loading: false, user, isAdmin });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  void load();
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      resetDirectoryAccess();
      resetTaskAccess();
      set({ loading: false, user: null, isAdmin: false });
      window.location.href = "/auth";
    } else if (event === "SIGNED_IN" || event === "USER_UPDATED") setTimeout(() => void load(), 0);
  });
}

export function useAuth() {
  const [s, setS] = useState<AuthState>(cache);
  useEffect(() => {
    start();
    setS(cache);
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/auth";
}
