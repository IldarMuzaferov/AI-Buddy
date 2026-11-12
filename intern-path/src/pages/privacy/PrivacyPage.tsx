import { useEffect, useState } from "react";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import {
  dateLabel,
  ErrorText,
  Glyph,
  Icon,
  QueryState,
} from "@/shared/ui/common";

const columns: Record<string, string> = {
  intern: "Вы",
  mentor: "Наставник",
  lead: "Лид",
  hr: "HR",
  ai_provider: "Провайдер ИИ",
};
export function PrivacyPage() {
  const api = useApi(),
    update = useUpdate(),
    privacy = useData(["privacy"], api.privacy.get);
  const [clearResult, setClearResult] = useState("");
  useEffect(() => {
    void api.system.event("privacy_opened").catch(() => undefined);
  }, [api]);
  return (
    <div className="page">
      <h1>Приватность</h1>
      <ErrorText error={update.error} />
      <QueryState query={privacy}>
        {(data) => (
          <>
            <p className="lead">{data.summary}</p>
            <div className="privacy-summary">
              <section className="ps-card only">
                <Glyph name="lock" />
                <h3>Только у вас</h3>
                <p>История чатов и знакомства.</p>
              </section>
              <section className="ps-card mentor">
                <Glyph name="list" />
                <h3>Наставнику</h3>
                <p>
                  {data.checklist_visible_to_mentor_by_default
                    ? "Прогресс чек-листа и статусы задач."
                    : "Статусы задач."}
                </p>
              </section>
              <section className="ps-card opt">
                <Glyph name="eyeoff" />
                <h3>По вашему выбору</h3>
                <p>Тема работы и выбранные записи журнала.</p>
              </section>
            </div>
            <div className="section-heading">
              <h2>Кто что видит</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Данные</th>
                    {data.columns.map((column) => (
                      <th key={column}>{columns[column] ?? column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.matrix.map((row) => (
                    <tr key={row.data}>
                      <th scope="row">{row.data}</th>
                      {data.columns.map((column) => (
                        <td key={column}>
                          {row[column] === "yes" ? (
                            <span className="yes">
                              <Icon name="check" />
                              Да
                            </span>
                          ) : row[column] === "no" ? (
                            <span className="no">Нет</span>
                          ) : (
                            (row[column] ?? "—")
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="panel">
              <h2>Что происходит с данными</h2>
              <ol className="flow-list">
                {data.flows.map((flow) => (
                  <li key={flow.title}>
                    <strong>{flow.title}</strong>
                    <p>{flow.text}</p>
                  </li>
                ))}
              </ol>
              <p className="muted">
                Провайдер ИИ:{" "}
                {data.ai_provider.mode === "fake"
                  ? "имитация"
                  : data.ai_provider.mode}
                {data.ai_provider.host && ` · ${data.ai_provider.host}`}
                {data.ai_provider.model && ` · ${data.ai_provider.model}`}
                {data.ai_provider.external && " · внешний сервис"}
              </p>
            </section>
            <section className="panel">
              <h2>Настройки</h2>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={data.settings.share_topics}
                  disabled={update.isPending}
                  onChange={(event) =>
                    update.mutate(() => api.privacy.set(event.target.checked))
                  }
                />
                Показывать тему наставнику
              </label>
              <button
                className="btn"
                disabled={update.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Удалить все чаты и вложения? Записи журнала и знакомства сохранятся.",
                    )
                  )
                    update.mutate(async () => {
                      const result = await api.privacy.clear();
                      setClearResult(
                        `Удалено чатов: ${result.deleted}. ${result.kept}`,
                      );
                    });
                }}
              >
                <Icon name="trash" />
                Удалить все чаты
              </button>
              {clearResult && <p role="status">{clearResult}</p>}
            </section>
            <section className="panel">
              <h2>Журнал доступа</h2>
              {data.access_log.length ? (
                <ul className="log-list">
                  {data.access_log.map((row, index) => (
                    <li key={index}>
                      <Icon
                        name={row.decision === "allow" ? "check" : "lock"}
                      />
                      <span>
                        {row.viewer_name} · {row.resource} ·{" "}
                        {row.decision === "allow" ? "Разрешено" : "Отказано"}
                        {row.reason && ` · ${row.reason}`}
                      </span>
                      <time>{dateLabel(row.created_at)}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Обращений к данным пока нет.</p>
              )}
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}
