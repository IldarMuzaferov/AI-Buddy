import { create } from "zustand";
export type Route =
  | {
      page:
        | "home"
        | "contacts"
        | "journal"
        | "privacy"
        | "mentor"
        | "tools"
        | "actions"
        | "tasks";
    }
  | { page: "chat" | "task"; id: string };
interface Navigation {
  route: Route;
  go: (route: Route) => void;
}
export const useNavigation = create<Navigation>((set) => ({
  route: { page: "home" },
  go: (route) => set({ route }),
}));
