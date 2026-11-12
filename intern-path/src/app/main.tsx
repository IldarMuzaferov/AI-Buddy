import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import "./prototype.css";
import "./app.css";

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 20000, refetchOnWindowFocus: true },
  },
});
const root = document.getElementById("root");
if (!root) throw new Error("Корневой элемент приложения отсутствует.");
createRoot(root).render(
  <QueryClientProvider client={client}>
    <App />
  </QueryClientProvider>,
);
