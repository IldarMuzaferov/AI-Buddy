import { useQueryClient } from "@tanstack/react-query";
import { useSession, type BackendMode } from "./store";
export function BackendSwitch() {
  const backend = useSession((state) => state.backend),
    change = useSession((state) => state.changeBackend);
  const cache = useQueryClient();
  return (
    <label className="backend-switch">
      Режим API{" "}
      <select
        value={backend}
        onChange={(event) => {
          const mode = event.target.value as BackendMode;
          if (
            useSession.getState().token &&
            !window.confirm(
              "Сменить режим API и выйти из текущей учётной записи?",
            )
          )
            return;
          cache.clear();
          change(mode);
        }}
      >
        <option value="mock">Мок</option>
        <option value="server">Локальный сервер</option>
      </select>
    </label>
  );
}
