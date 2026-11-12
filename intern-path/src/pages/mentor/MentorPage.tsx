import { useState } from "react";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import { ApiError } from "@/shared/api/transport";
import {
  Avatar,
  Badge,
  dateLabel,
  Dialog,
  ErrorText,
  formText,
  Icon,
  QueryState,
  taskColors,
  taskLabels,
} from "@/shared/ui/common";

export function MentorPage() {
  const api = useApi(),
    interns = useData(["interns"], api.mentor.interns),
    update = useUpdate();
  const [creating, setCreating] = useState<{ id: string; name: string }>(),
    [denial, setDenial] = useState("");
  return (
    <div className="page">
      <h1>Мои стажёры</h1>
      <ErrorText error={update.error} />
      <QueryState query={interns}>
        {(data) => (
          <>
            <p className="lead">{data.note}</p>
            {data.interns.map((card) => (
              <article className="intern-card" key={card.intern.id}>
                <div className="intern-head">
                  <Avatar name={card.intern.name} size="lg" />
                  <span>
                    <strong>{card.intern.name}</strong>
                    <small>
                      {card.intern.team} · {card.intern.stage.label} · день{" "}
                      {card.intern.day} из {card.intern.total_days}
                    </small>
                  </span>
                  {card.is_absent_today && (
                    <Badge color="wait">Сегодня в отгуле</Badge>
                  )}
                  <button
                    className="btn primary"
                    onClick={() => {
                      update.reset();
                      setCreating(card.intern);
                    }}
                  >
                    <Icon name="plus" />
                    Создать задачу
                  </button>
                </div>
                {card.topic && <p className="muted">Тема: {card.topic}</p>}
                <div className="m-grid">
                  <section className="m-panel">
                    <h3>Чек-лист</h3>
                    <div className="progress">
                      <i
                        style={{
                          width: `${card.checklist.total ? (100 * card.checklist.done) / card.checklist.total : 0}%`,
                        }}
                      />
                    </div>
                    <p>
                      {card.checklist.done} из {card.checklist.total}
                    </p>
                    <ul>
                      {card.checklist.current_stage.map((step) => (
                        <li key={step.id}>
                          <span>{step.title}</span>
                          {step.status === "done" && <Icon name="check" />}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="m-panel">
                    <h3>Задачи</h3>
                    {card.tasks.length ? (
                      <ul>
                        {card.tasks.map((task) => (
                          <li key={task.id}>
                            <span>
                              {task.title} · {dateLabel(task.deadline)}
                            </span>
                            <Badge color={taskColors[task.status]}>
                              {task.status_label ?? taskLabels[task.status]}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Задач пока нет.</p>
                    )}
                  </section>
                  <section className="m-panel">
                    <h3>Заявки и отгулы</h3>
                    <ul>
                      {card.access_requests.map((item) => (
                        <li key={item.id}>
                          {item.number} · {item.project_key} · {item.level} ·{" "}
                          {item.status}
                        </li>
                      ))}
                      {card.absences.map((item) => (
                        <li key={item.id}>
                          {item.number} · {dateLabel(item.date_from)} ·{" "}
                          {item.status}
                        </li>
                      ))}
                      {card.doc_issues.map((item) => (
                        <li key={item.id}>
                          {item.summary} · {item.status}
                        </li>
                      ))}
                    </ul>
                    {!card.access_requests.length &&
                      !card.absences.length &&
                      !card.doc_issues.length && <p>Записей пока нет.</p>}
                  </section>
                  <section className="m-panel wide">
                    <h3>Как помочь</h3>
                    <p>{card.help_template}</p>
                    <p>
                      <strong>Фраза для 1:1:</strong> {card.one_to_one_phrase}
                    </p>
                  </section>
                  {card.shared_journal.length > 0 && (
                    <section className="m-panel wide">
                      <h3>Записи журнала, которыми поделились</h3>
                      <ul>
                        {card.shared_journal.map((entry) => (
                          <li key={entry.id}>
                            {entry.text} · {dateLabel(entry.created_at)}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
                {card.chats_access === "denied" && (
                  <div className="lockline">
                    <Icon name="lock" />
                    Чаты и вопросы доступны только стажёру.
                  </div>
                )}
              </article>
            ))}
          </>
        )}
      </QueryState>
      <section className="panel">
        <button
          className="btn small"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(async () => {
              try {
                await api.chats.list();
                setDenial("API вернул данные.");
              } catch (error) {
                if (error instanceof ApiError && error.status === 403)
                  setDenial("403 · Чаты доступны только стажёру.");
                else throw error;
              }
            })
          }
        >
          Проверить ограничение доступа к чатам
        </button>
        {denial && <p role="status">{denial}</p>}
      </section>
      {creating && (
        <Dialog
          title={`Задача для ${creating.name}`}
          onClose={() => setCreating(undefined)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              update.mutate(async () => {
                await api.mentor.createTask({
                  intern_id: creating.id,
                  title: formText(form, "title"),
                  description: formText(form, "description"),
                  deadline: formText(form, "deadline"),
                });
                setCreating(undefined);
              });
            }}
          >
            <label className="field">
              Название
              <input autoFocus name="title" required />
            </label>
            <label className="field">
              Описание
              <textarea name="description" />
            </label>
            <label className="field">
              Срок
              <input name="deadline" type="date" required />
            </label>
            <ErrorText error={update.error} />
            <button className="btn primary" disabled={update.isPending}>
              Создать
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
