import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import { ErrorText, Icon, QueryState } from "@/shared/ui/common";
import { useNavigation } from "@/shared/ui/navigation";
import { TaskSummary } from "@/widgets/shell/TaskSummary";

export function TaskPage({ id }: { id: string }) {
  const api = useApi(),
    task = useData(["task", id], () => api.tasks.get(id)),
    update = useUpdate(),
    go = useNavigation((state) => state.go);
  return (
    <div className="page">
      <QueryState query={task}>
        {(data) => (
          <>
            <TaskSummary task={data} />
            {data.notes.map((note) => (
              <p className="norm" key={note}>
                {note}
              </p>
            ))}
            <div className="section-heading">
              <h2>Чаты задачи</h2>
              <button
                className="btn primary"
                disabled={
                  data.locked || !data.can_create_chat || update.isPending
                }
                onClick={() =>
                  update.mutate(async () => {
                    const chat = await api.chats.create({ task_id: id });
                    go({ page: "chat", id: chat.id });
                  })
                }
              >
                <Icon name="plus" /> Новый чат в задаче
              </button>
            </div>
            <ErrorText error={update.error} />
            {data.chats.length ? (
              data.chats.map((chat) => (
                <button
                  className="sb-link"
                  key={chat.id}
                  onClick={() => go({ page: "chat", id: chat.id })}
                >
                  <Icon name="chat" />
                  {chat.title}
                  {chat.unresolved && <span className="udot" />}
                </button>
              ))
            ) : (
              <p className="lead">В этой задаче пока нет чатов.</p>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
export function TasksPage() {
  const api = useApi(),
    tasks = useData(["tasks"], api.tasks.list),
    go = useNavigation((state) => state.go);
  return (
    <div className="page">
      <h1>Задачи из трекера</h1>
      <QueryState query={tasks}>
        {(items) =>
          items.length ? (
            items.map((task) => (
              <div key={task.id}>
                <TaskSummary task={task} />
                <button
                  className="btn small"
                  onClick={() => go({ page: "task", id: task.id })}
                >
                  Открыть папку
                </button>
              </div>
            ))
          ) : (
            <p className="lead">Наставник ещё не создал задачи.</p>
          )
        }
      </QueryState>
    </div>
  );
}
