import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useData } from "@/entities/session/api/client";
import { useSession } from "@/entities/session/store";
import { Avatar, Icon, PROJECT_NAME, QueryState } from "@/shared/ui/common";
import { useNavigation, type Route } from "@/shared/ui/navigation";
import type { Chat, Profile } from "@/shared/api/contracts";
import { Notifications } from "@/features/notifications/Notifications";
import { BackendSwitch } from "@/entities/session/BackendSwitch";

const names = {
  home: "Новый чат",
  chat: "Чат",
  task: "Задача",
  tasks: "Задачи",
  contacts: "Знакомства",
  journal: "Журнал достижений",
  privacy: "Приватность",
  mentor: "Мои стажёры",
  tools: "Служебная панель",
  actions: "Заявки",
};
export function Shell({
  user,
  children,
}: {
  user: Profile;
  children: ReactNode;
}) {
  const { route, go } = useNavigation(),
    api = useApi(),
    cache = useQueryClient(),
    signOut = useSession((state) => state.signOut);
  const [open, setOpen] = useState(false),
    [profile, setProfile] = useState(false);
  const [folders, setFolders] = useState<Record<string, boolean>>({});
  const isIntern = user.role === "intern";
  const chats = useData(["chats"], api.chats.list, isIntern);
  function navigate(route: Route) {
    go(route);
    setOpen(false);
  }
  function chatRow(chat: Chat) {
    return (
      <div
        key={chat.id}
        className={`sb-row ${route.page === "chat" && route.id === chat.id ? "cur" : ""}`}
      >
        <button
          className="sb-item"
          onClick={() => navigate({ page: "chat", id: chat.id })}
        >
          <Icon name="chat" />
          <span className="t">{chat.title}</span>
          {chat.unresolved && <span className="udot" title="Не решено" />}
        </button>
      </div>
    );
  }
  const links = [
    ["journal", "award"],
    ["contacts", "people"],
    ["privacy", "shield"],
    ["actions", "key"],
    ["tasks", "folder"],
  ] as const;
  return (
    <div className={`app ${open ? "sb-open" : ""}`}>
      {open && (
        <button
          className="scrim"
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className="sidebar" aria-label="Меню">
        <button
          className="sb-brand"
          onClick={() =>
            navigate({
              page: isIntern
                ? "home"
                : user.role === "mentor"
                  ? "mentor"
                  : "tools",
            })
          }
        >
          <img src="/assets/logo.svg" alt="Авито" />
          <span>{PROJECT_NAME}</span>
        </button>
        <div className="sb-scroll">
          {isIntern ? (
            <>
              <button
                className="btn primary sb-new"
                onClick={() => navigate({ page: "home" })}
              >
                <Icon name="plus" /> Новый чат
              </button>
              <nav className="sb-nav">
                {links.map(([page, icon]) => (
                  <button
                    key={page}
                    className="sb-link"
                    aria-current={route.page === page ? "page" : undefined}
                    onClick={() => navigate({ page })}
                  >
                    <Icon name={icon} />
                    {names[page]}
                  </button>
                ))}
              </nav>
              <QueryState query={chats}>
                {(data) => (
                  <>
                    <div className="sb-label">
                      <span>Задачи</span>
                      <span>из трекера</span>
                    </div>
                    {data.tasks.length ? (
                      data.tasks.map(({ task, chats }) => {
                        const expanded =
                          folders[task.id] ?? task.status === "in_progress";
                        return (
                          <div key={task.id}>
                            <div className="sb-row">
                              <button
                                className="sb-item"
                                onClick={() =>
                                  navigate({ page: "task", id: task.id })
                                }
                              >
                                <Icon name={task.locked ? "lock" : "folder"} />
                                <span className="t">{task.title}</span>
                                <span className={`sdot ${task.status}`} />
                              </button>
                              <button
                                className="icon-button folder-toggle"
                                aria-label={`Чаты задачи «${task.title}»`}
                                aria-expanded={expanded}
                                onClick={() =>
                                  setFolders((current) => ({
                                    ...current,
                                    [task.id]: !expanded,
                                  }))
                                }
                              >
                                <Icon
                                  name={expanded ? "chevdown" : "chevron"}
                                />
                              </button>
                            </div>
                            {expanded && (
                              <div className="sb-sub">
                                {chats.length ? (
                                  chats.map(chatRow)
                                ) : (
                                  <p className="sb-empty">Чатов пока нет</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="sb-empty">{data.empty_tasks_text}</p>
                    )}
                    <div className="sb-label">История</div>
                    {data.history.length ? (
                      data.history.map(chatRow)
                    ) : (
                      <p className="sb-empty">
                        Здесь появятся ваши чаты. Их видите только вы.
                      </p>
                    )}
                  </>
                )}
              </QueryState>
            </>
          ) : (
            user.role === "mentor" && (
              <button
                className="sb-link"
                onClick={() => navigate({ page: "mentor" })}
              >
                <Icon name="people" />
                Мои стажёры
              </button>
            )
          )}
          <button
            className="sb-link"
            onClick={() => navigate({ page: "tools" })}
          >
            <Icon name="wrench" />
            {names.tools}
          </button>
        </div>
        <div className="sb-foot">
          {profile && (
            <div className="profile-settings">
              <BackendSwitch />
              <button
                className="btn small"
                onClick={() => {
                  cache.clear();
                  signOut();
                  go({ page: "home" });
                }}
              >
                Сменить пользователя
              </button>
            </div>
          )}
          <button
            className="sb-profile"
            aria-expanded={profile}
            onClick={() => setProfile(!profile)}
          >
            <Avatar name={user.name} />
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.title}
                {user.intern &&
                  ` · день ${user.intern.day} из ${user.intern.total_days}`}
              </small>
            </span>
            <Icon name="dots" />
          </button>
          <p className="sb-test">Тестовые данные, не регламенты Авито</p>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button burger"
            aria-label="Открыть меню"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <span className="crumb">{names[route.page]}</span>
          {user.intern && (
            <span className="stage-pill">
              <span className="live-dot" />
              {user.intern.stage.label}
              <span className="long">
                {" "}
                · день {user.intern.day} из {user.intern.total_days}
              </span>
            </span>
          )}
          <Notifications />
        </header>
        <div
          className="content"
          id="content"
          key={route.page + ("id" in route ? route.id : "")}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
