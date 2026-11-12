import { useState } from "react";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import type { PracticeItem } from "@/shared/api/contracts";
import { ErrorText, Glyph, Icon, QueryState } from "@/shared/ui/common";

export function PracticeItems({ items }: { items: PracticeItem[] }) {
  const api = useApi(),
    update = useUpdate();
  const list = useData(["practice"], api.practice.list);
  return (
    <div className="practice-list">
      <ErrorText error={update.error} />
      {items.map((item) => {
        const current =
          list.data?.find((current) => current.id === item.id) ?? item;
        return (
          <label className="selection-item" key={item.id}>
            <input
              type="checkbox"
              checked={current.status === "done"}
              disabled={update.isPending}
              onChange={(event) =>
                update.mutate(() =>
                  api.practice.set(
                    item.id,
                    event.target.checked ? "done" : "open",
                  ),
                )
              }
            />
            <span>
              <strong>{item.task}</strong>
              <small>Критерий: {item.criterion}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function PracticeButton({ stepId }: { stepId: string }) {
  const api = useApi(),
    update = useUpdate();
  const [items, setItems] = useState<PracticeItem[]>([]);
  return (
    <>
      <button
        className="btn small"
        disabled={update.isPending}
        onClick={() =>
          update.mutate(async () =>
            setItems((await api.checklist.generate(stepId)).items),
          )
        }
      >
        <Icon name="list" />
        Дай практику
      </button>
      <ErrorText error={update.error} />
      {items.length > 0 && <PracticeItems items={items} />}
    </>
  );
}
export function PracticePanel() {
  const api = useApi(),
    practice = useData(["practice"], api.practice.list);
  return (
    <details className="panel">
      <summary>Мои задания для практики</summary>
      <QueryState query={practice}>
        {(items) =>
          items.length ? (
            <PracticeItems items={items} />
          ) : (
            <p className="muted">Микро-заданий пока нет.</p>
          )
        }
      </QueryState>
    </details>
  );
}
export function Checklist() {
  const api = useApi(),
    query = useData(["checklist"], api.checklist.list),
    update = useUpdate();
  return (
    <QueryState query={query}>
      {(data) => (
        <details className="panel">
          <summary>Чек-лист стажировки</summary>
          <p className="lead">{data.note}</p>
          <ErrorText error={update.error} />
          {data.stages.map((stage) => (
            <details key={stage.id} open={stage.current || undefined}>
              <summary>
                {stage.label} · {stage.done} из {stage.total}
              </summary>
              <ul className="steps-list">
                {stage.steps.map((step) => (
                  <li
                    className={`step-row ${step.status === "done" ? "done" : ""}`}
                    key={step.id}
                  >
                    <label className="step-check">
                      <input
                        type="checkbox"
                        checked={step.status === "done"}
                        disabled={step.status === "hidden" || update.isPending}
                        onChange={(event) =>
                          update.mutate(() =>
                            api.checklist.set(
                              step.id,
                              event.target.checked ? "done" : "todo",
                            ),
                          )
                        }
                      />
                      <span>{step.title}</span>
                    </label>
                    <select
                      aria-label={`Статус шага «${step.title}»`}
                      value={step.status}
                      disabled={update.isPending}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (
                          value === "todo" ||
                          value === "in_progress" ||
                          value === "done" ||
                          value === "hidden"
                        )
                          update.mutate(() =>
                            api.checklist.set(step.id, value),
                          );
                      }}
                    >
                      <option value="todo">К выполнению</option>
                      <option value="in_progress">В работе</option>
                      <option value="done">Готово</option>
                      <option value="hidden">Не про нашу команду</option>
                    </select>
                    {step.has_practice && step.status !== "hidden" && (
                      <PracticeButton stepId={step.id} />
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </details>
      )}
    </QueryState>
  );
}
export function PracticeCard({
  label,
  items,
}: {
  label: string;
  items: PracticeItem[];
}) {
  return (
    <section className="result-card neutral">
      <div className="result-kicker">
        <Glyph name="list" color="purple" />
        <strong>Практика · {label}</strong>
      </div>
      <PracticeItems items={items} />
    </section>
  );
}
