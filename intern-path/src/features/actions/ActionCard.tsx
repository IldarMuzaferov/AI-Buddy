import { useState } from "react";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import type { ActionDraft, Field, Payload } from "@/shared/api/contracts";
import {
  dateLabel,
  ErrorText,
  Glyph,
  Icon,
  QueryState,
  splitList,
} from "@/shared/ui/common";

export const actionLabels = {
  access_request: "Заявка на доступ",
  absence_request: "Заявка на отгул",
  doc_conflict_report: "Сообщение о расхождении",
};
export const actionStatus = {
  draft: "Черновик",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
  failed: "Ошибка",
};
const conflictFields: Field[] = [
  { key: "text", label: "Текст сообщения", type: "textarea", required: true },
];
const absenceFields: Field[] = [
  { key: "date_from", label: "Начало", type: "date", required: true },
  { key: "date_to", label: "Окончание", type: "date", required: true },
  { key: "kind", label: "Тип отсутствия", type: "text", required: true },
  { key: "reason", label: "Причина", type: "textarea", required: true },
];
const valueText = (value: unknown) =>
  Array.isArray(value)
    ? value.join(", ")
    : typeof value === "string" || typeof value === "number"
      ? String(value)
      : "";
function ActionField({ field, value }: { field: Field; value: unknown }) {
  const initial = valueText(value);
  const props = {
    name: field.key,
    required: field.required,
    defaultValue: initial,
  };
  return (
    <label className="field">
      <span>{field.label}</span>
      {field.options?.length ? (
        <select {...props}>
          <option value="">Выберите значение</option>
          {field.options.map((option) =>
            typeof option === "string" ? (
              <option key={option}>{option}</option>
            ) : (
              <option key={option.value} value={option.value}>
                {option.label ?? option.value}
              </option>
            ),
          )}
        </select>
      ) : field.type === "textarea" ||
        ["justification", "reason", "text"].includes(field.key) ? (
        <textarea rows={3} {...props} />
      ) : (
        <input
          type={
            ["date", "number", "email"].includes(field.type)
              ? field.type
              : "text"
          }
          {...props}
        />
      )}
    </label>
  );
}

export function ActionCard({
  actionId,
  draft,
}: {
  actionId: string;
  draft?: ActionDraft;
}) {
  const api = useApi(),
    action = useData(["action", actionId], () => api.actions.get(actionId)),
    update = useUpdate();
  const presets = useData(
    ["access-presets"],
    api.actions.presets,
    action.data?.type === "access_request" && !draft?.fields.length,
  );
  const [reminder, setReminder] = useState<{ text: string; channel: string }>();
  const [editing, setEditing] = useState(false),
    [checked, setChecked] = useState(false);
  const fields = draft?.fields.length
    ? draft.fields
    : action.data?.type === "doc_conflict_report"
      ? conflictFields
      : action.data?.type === "absence_request"
        ? absenceFields
        : (presets.data?.fields ?? []);
  return (
    <section className="result-card action-card">
      <QueryState query={action}>
        {(data) => (
          <>
            <div className="result-kicker">
              <Glyph
                name={
                  data.type === "access_request"
                    ? "key"
                    : data.type === "absence_request"
                      ? "calendar"
                      : "alert"
                }
                color="purple"
              />
              <strong>
                {actionLabels[data.type]} · {actionStatus[data.status]}{" "}
                {data.external_id}
              </strong>
            </div>
            {data.approver_name && data.type !== "doc_conflict_report" && (
              <p>Согласующий: {data.approver_name}</p>
            )}
            {draft?.level_hint && <p className="muted">{draft.level_hint}</p>}
            {data.status === "draft" && (
              <p className="lead">
                Проверьте черновик. Заявка отправится после подтверждения.
              </p>
            )}
            <ErrorText
              error={
                update.error ??
                presets.error ??
                (data.error ? new Error(data.error.message) : undefined)
              }
            />
            {editing && data.status === "draft" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget),
                    body: Payload = {};
                  for (const field of fields) {
                    const text = valueText(form.get(field.key)).trim();
                    body[field.key] =
                      Array.isArray(data.payload[field.key]) ||
                      field.key === "watch_issue_types" ||
                      ["list", "multiselect"].includes(field.type)
                        ? splitList(text)
                        : field.type === "number" && text
                          ? Number(text)
                          : text;
                  }
                  update.mutate(async () => {
                    await api.actions.edit(actionId, body);
                    setEditing(false);
                  });
                }}
              >
                {fields.map((field) => (
                  <ActionField
                    key={field.key}
                    field={field}
                    value={data.payload[field.key]}
                  />
                ))}
                <div className="actions">
                  <button className="btn primary" disabled={update.isPending}>
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setEditing(false)}
                  >
                    Закрыть форму
                  </button>
                </div>
              </form>
            ) : (
              <>
                <dl className="kv">
                  {Object.entries(data.payload).map(([key, value]) => (
                    <div className="kv-row" key={key}>
                      <dt>
                        {fields.find((field) => field.key === key)?.label ??
                          key}
                      </dt>
                      <dd>{valueText(value) || "—"}</dd>
                    </div>
                  ))}
                </dl>
                {data.status === "draft" && (
                  <div className="actions">
                    <button
                      className="btn primary"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate(() => api.actions.confirm(actionId))
                      }
                    >
                      {data.type === "doc_conflict_report"
                        ? "Сообщить владельцу страницы и наставнику"
                        : "Подтвердить"}
                    </button>
                    <button
                      className="btn"
                      disabled={!fields.length || update.isPending}
                      onClick={() => setEditing(true)}
                    >
                      Изменить
                    </button>
                    <button
                      className="btn"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate(() => api.actions.cancel(actionId))
                      }
                    >
                      Отмена
                    </button>
                  </div>
                )}
              </>
            )}
            <ul className="timeline">
              {data.timeline.map((item, index) => (
                <li key={index}>
                  <span>{item.text}</span>
                  {item.at && <small> · {dateLabel(item.at)}</small>}
                </li>
              ))}
            </ul>
            {data.external_status === "pending" && (
              <button
                className="btn small"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(async () =>
                    setReminder(await api.actions.reminder(actionId)),
                  )
                }
              >
                Подготовить напоминание
              </button>
            )}
            {reminder && (
              <div className="panel">
                <p>{reminder.text}</p>
                <button
                  className="btn small"
                  onClick={() =>
                    update.mutate(() =>
                      navigator.clipboard.writeText(reminder.text),
                    )
                  }
                >
                  <Icon name="copy" />
                  Скопировать для {reminder.channel}
                </button>
              </div>
            )}
            {data.checklist_prompt && !checked && (
              <div className="norm">
                <span>
                  Отметить шаг «{data.checklist_prompt.title}» выполненным?
                </span>
                <button
                  className="btn small"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate(async () => {
                      if (data.checklist_prompt) {
                        await api.checklist.set(
                          data.checklist_prompt.step_id,
                          "done",
                        );
                        setChecked(true);
                      }
                    })
                  }
                >
                  Отметить
                </button>
              </div>
            )}
          </>
        )}
      </QueryState>
    </section>
  );
}
