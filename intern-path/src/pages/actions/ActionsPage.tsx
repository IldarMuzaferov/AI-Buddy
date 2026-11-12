import { useState } from "react";
import { useApi, useData } from "@/entities/session/api/client";
import { QueryState } from "@/shared/ui/common";
import { ActionCard, actionLabels } from "@/features/actions/ActionCard";

export function ActionsPage() {
  const api = useApi(),
    [type, setType] = useState<keyof typeof actionLabels>();
  const list = useData(["actions", type], () => api.actions.list(type));
  return (
    <div className="page">
      <h1>Заявки</h1>
      <label className="field">
        Тип заявки
        <select
          value={type ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            setType(
              value === "access_request" ||
                value === "absence_request" ||
                value === "doc_conflict_report"
                ? value
                : undefined,
            );
          }}
        >
          <option value="">Все</option>
          {Object.entries(actionLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <QueryState query={list}>
        {(items) =>
          items.length ? (
            items.map((item) => <ActionCard key={item.id} actionId={item.id} />)
          ) : (
            <p className="lead">Заявок пока нет.</p>
          )
        }
      </QueryState>
    </div>
  );
}
