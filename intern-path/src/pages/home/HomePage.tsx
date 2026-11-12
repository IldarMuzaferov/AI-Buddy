import { useApi, useData } from "@/entities/session/api/client";
import type { Profile } from "@/shared/api/contracts";
import { Composer } from "@/features/assistant/Composer";
import { useAssistant } from "@/features/assistant/useAssistant";
import {
  Checklist,
  PracticeButton,
  PracticePanel,
} from "@/features/checklist/Practice";
import {
  dateLabel,
  Glyph,
  Hero,
  Icon,
  QueryState,
  taskLabels,
} from "@/shared/ui/common";
import { useNavigation } from "@/shared/ui/navigation";

export function HomePage({ user }: { user: Profile }) {
  const api = useApi(),
    home = useData(["home"], api.home),
    flags = useData(["flags"], api.system.flags);
  const assistant = useAssistant(),
    go = useNavigation((state) => state.go);
  const ask = (text: string) =>
    void assistant.send(text, flags.data?.guide_mode_default ?? "guide");
  return (
    <div className="page">
      <QueryState query={home}>
        {(data) => (
          <>
            <section className="home-hero">
              <div className="hero-copy">
                <span className="eyebrow">
                  <span className="live-dot" />
                  Путь стажёра
                  {user.team_id &&
                    ` · команда ${user.team_id === "payments" ? "Payments" : user.team_id}`}
                </span>
                <h1>
                  С чего начнём<span className="blue-period">?</span>
                </h1>
                <p>
                  Спросите, где что лежит, кто отвечает и как здесь принято.
                </p>
                {user.intern?.is_absent_today && (
                  <p className="norm">
                    <Icon name="calendar" /> Сегодня вы в отгуле
                  </p>
                )}
                <Composer home />
                <div className="chips" aria-label="Подсказки">
                  {data.suggestions.map((suggestion) => (
                    <button
                      className="chip"
                      key={suggestion}
                      disabled={assistant.pending}
                      onClick={() => ask(suggestion)}
                    >
                      <Icon name="spark" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
              <Hero note={data.privacy_note} />
            </section>
            <div className="home-grid">
              <section className="card">
                <div className="card-top">
                  <Glyph name="clock" color="purple" />
                  <span className="eyebrow">На чём остановились</span>
                </div>
                {data.digest ? (
                  <>
                    <h3>{data.digest.chat_title}</h3>
                    <p>{data.digest.text}</p>
                    <div className="actions">
                      <button
                        className="btn"
                        onClick={() =>
                          data.digest &&
                          go({ page: "chat", id: data.digest.chat_id })
                        }
                      >
                        Продолжить
                      </button>
                    </div>
                  </>
                ) : (
                  <p>Ваши разговоры появятся здесь.</p>
                )}
              </section>
              <section className="card">
                <div className="card-top">
                  <Glyph name="target" />
                  <span className="eyebrow">Следующий шаг</span>
                </div>
                {data.next_step ? (
                  <>
                    <h3>{data.next_step.title}</h3>
                    <p>{data.next_step.note}</p>
                    <div className="actions">
                      <button
                        className="btn primary"
                        disabled={assistant.pending}
                        onClick={() =>
                          ask(`Помоги с шагом «${data.next_step?.title}»`)
                        }
                      >
                        Спросить ассистента
                      </button>
                      <PracticeButton stepId={data.next_step.step_id} />
                    </div>
                  </>
                ) : (
                  <p>Все шаги отмечены.</p>
                )}
              </section>
            </div>
            <section className="journey">
              <div className="section-heading">
                <h2>Путь стажёра</h2>
                <span className="muted">
                  День {data.day} из {data.total_days}
                </span>
              </div>
              <ol className="stages">
                {data.stages.map((stage) => (
                  <li className={`stage ${stage.state}`} key={stage.id}>
                    <span className="bar">
                      {stage.state === "current" && (
                        <i
                          style={{ width: `${(stage.progress ?? 0) * 100}%` }}
                        />
                      )}
                    </span>
                    <span>
                      {stage.state === "done" && <Icon name="check" />}
                      {stage.label}
                    </span>
                    {stage.state === "current" && (
                      <span className="here">Вы здесь · день {data.day}</span>
                    )}
                  </li>
                ))}
              </ol>
              <div className="norm">
                <Icon name="spark" />
                <p>{data.normalization_text}</p>
              </div>
              <Checklist />
            </section>
            <PracticePanel />
            {data.tasks_today.length > 0 && (
              <section className="panel">
                <h2>Задачи сегодня</h2>
                {data.tasks_today.map((task) => (
                  <button
                    key={task.id}
                    className="sb-link"
                    onClick={() => go({ page: "task", id: task.id })}
                  >
                    <Icon name="folder" />
                    {task.title} · {taskLabels[task.status]} ·{" "}
                    {dateLabel(task.deadline)}
                  </button>
                ))}
              </section>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
