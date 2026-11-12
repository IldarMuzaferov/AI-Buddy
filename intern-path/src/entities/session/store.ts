import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Profile } from "@/shared/api/contracts";

export type BackendMode = "mock" | "server";
interface SessionState {
  backend: BackendMode;
  token: string | null;
  user: Profile | null;
  changeBackend: (backend: BackendMode) => void;
  signIn: (token: string, user: Profile) => void;
  signOut: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      backend: import.meta.env?.VITE_API_MODE === "server" ? "server" : "mock",
      token: null,
      user: null,
      changeBackend: (backend) => set({ backend, token: null, user: null }),
      signIn: (token, user) => set({ token, user }),
      signOut: () => set({ token: null, user: null }),
    }),
    {
      name: "intern-path-session-v1",
      partialize: ({ backend }) => ({ backend }),
    },
  ),
);
