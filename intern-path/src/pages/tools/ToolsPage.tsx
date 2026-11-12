import { useState } from "react";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import type { Profile, TaskStatus } from "@/shared/api/contracts";
import {
  ErrorText,
  formText,
  QueryState,
  taskLabels,
} from "@/shared/ui/common";

function DevTools({ user }: { user: Profile }) {
  const api = useApi(),
    update = useUpdate();
  const [output, setOutput] = useState("");
  const defaultIntern = user.role === "intern" ? user.id : "anya";
  const run = (operation: () => Promise<unknown>) =>
    update.mutate(async () => {
      setOutput("");
      setOutput(JSON.stringify(await operation(), null, 2) ?? "Выполнено");
    });
  const tasks = useData(["tasks"], api.tasks.list, user.role === "intern");
  const actions = useData(
    ["actions", undefined],
    () => api.actions.list(),
    user.role === "intern",
  );
  return (
    <section className="panel">
      <h2>Dev-панель</h2>
      <fieldset disabled={update.isPending}>
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(() =>
              api.dev.createTask({
                intern_id: formText(form, "intern"),
                title: formText(form, "title"),
                description: formText(form, "description") || undefined,
                deadline: formText(form, "deadline") || undefined,
              }),
            );
          }}
        >
          <h3>Создать задачу в трекере</h3>
          <label className="field">
            Стажёр
            <select name="intern" defaultValue={defaultIntern}>
              <option value="anya">Аня Соколова</option>
              <option value="dima">Дима Орлов</option>
            </select>
          </label>
          <label className="field">
            Название
            <input name="title" required />
          </label>
          <label className="field">
            Описание
            <textarea name="description" />
          </label>
          <label className="field">
            Срок
            <input name="deadline" type="date" />
          </label>
          <button className="btn">Создать задачу</button>
        </form>
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget),
              status = formText(form, "status");
            run(() =>
              api.dev.updateTask({
                task_id: formText(form, "task"),
                status: status ? (status as TaskStatus) : undefined,
                deadline: formText(form, "deadline") || undefined,
                description: formText(form, "description") || undefined,
                shift_days: formText(form, "shift")
                  ? Number(formText(form, "shift"))
                  : undefined,
              }),
            );
          }}
        >
          <h3>Обновить задачу</h3>
          <label className="field">
            ID задачи
            <input name="task" list="dev-tasks" required />
          </label>
          <datalist id="dev-tasks">
            {tasks.data?.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </datalist>
          <label className="field">
            Статус
            <select name="status">
              <option value="">Без изменений</option>
              {Object.entries(taskLabels).map(([status, label]) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Новый срок
            <input type="date" name="deadline" />
          </label>
          <label className="field">
            Сдвинуть срок на дней
            <input type="number" name="shift" />
          </label>
          <label className="field">
            Новое описание
            <textarea name="description" />
          </label>
          <button className="btn">Обновить задачу</button>
        </form>
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const operation =
              event.nativeEvent instanceof SubmitEvent &&
              event.nativeEvent.submitter instanceof HTMLButtonElement
                ? event.nativeEvent.submitter.value
                : "approve";
            const id = formText(form, "id");
            run(() =>
              operation === "reject"
                ? api.dev.reject(id, formText(form, "reason") || undefined)
                : api.dev.approve(id),
            );
          }}
        >
          <h3>Согласование доступа</h3>
          <label className="field">
            ID заявки
            <input name="id" list="dev-actions" required />
          </label>
          <datalist id="dev-actions">
            {actions.data
              ?.filter((action) => action.external_status === "pending")
              .map((action) => (
                <option key={action.id} value={action.id}>
                  {action.external_id}
                </option>
              ))}
          </datalist>
          <label className="field">
            Причина отклонения
            <input name="reason" />
          </label>
          <div className="actions">
            <button className="btn" value="approve">
              Согласовать
            </button>
            <button className="btn" value="reject">
              Отклонить
            </button>
          </div>
        </form>
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(() =>
              api.dev.advance(
                formText(form, "intern"),
                Number(formText(form, "days")),
              ),
            );
          }}
        >
          <h3>Перемотать день стажировки</h3>
          <label className="field">
            Стажёр
            <select name="intern" defaultValue={defaultIntern}>
              <option value="anya">Аня Соколова</option>
              <option value="dima">Дима Орлов</option>
            </select>
          </label>
          <label className="field">
            Дней
            <input name="days" type="number" defaultValue={7} required />
          </label>
          <button className="btn">Применить</button>
        </form>
        <div className="actions section-actions">
          <button
            className="btn"
            onClick={() => run(() => api.dev.failNext(true))}
          >
            Ошибка следующего ответа
          </button>
          <button
            className="btn"
            onClick={() => run(() => api.dev.failNext(false))}
          >
            Отключить ошибку
          </button>
          <button className="btn" onClick={() => run(api.dev.sync)}>
            Синхронизировать задачи
          </button>
          <button
            className="btn"
            onClick={() => {
              if (window.confirm("Сбросить все демо-данные?"))
                run(api.dev.reset);
            }}
          >
            Сбросить демо
          </button>
        </div>
      </fieldset>
      <ErrorText error={update.error} />
      {output && (
        <pre className="api-output" role="status">
          {output}
        </pre>
      )}
    </section>
  );
}
export function ToolsPage({ user }: { user: Profile }) {
  const api = useApi(),
    health = useData(["health"], api.system.health),
    flags = useData(["flags"], api.system.flags);
  const update = useUpdate(),
    [output, setOutput] = useState("");
  const run = (operation: () => Promise<unknown>) =>
    update.mutate(async () => {
      setOutput("");
      const data = await operation();
      setOutput(
        typeof data === "string"
          ? data
          : (JSON.stringify(data, null, 2) ?? "Готово"),
      );
    });
  return (
    <div className="page">
      <h1>Служебная панель</h1>
      <section className="panel">
        <h2>Состояние API</h2>
        <QueryState query={health}>
          {(data) => (
            <pre className="api-output">{JSON.stringify(data, null, 2)}</pre>
          )}
        </QueryState>
        <p className="muted">
          Режим ответа по умолчанию: {flags.data?.guide_mode_default ?? "—"}
        </p>
        <ErrorText error={flags.error} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const search = formText(new FormData(event.currentTarget), "q");
            run(() => api.system.search(search));
          }}
        >
          <label className="field">
            Поиск по базе знаний
            <input type="search" name="q" required />
          </label>
          <button className="btn" disabled={update.isPending}>
            Найти
          </button>
        </form>
        <div className="actions section-actions">
          <button
            className="btn"
            disabled={update.isPending}
            onClick={() => run(api.system.metrics)}
          >
            Метрики Prometheus
          </button>
          {user.role !== "intern" && (
            <button
              className="btn"
              disabled={update.isPending}
              onClick={() => run(api.system.summary)}
            >
              Сводка метрик
            </button>
          )}
        </div>
        <ErrorText error={update.error} />
        {output && (
          <pre className="api-output" aria-live="polite">
            {output}
          </pre>
        )}
      </section>
      {health.data?.dev_mode && <DevTools user={user} />}
    </div>
  );
}
