import { useMutation } from "@tanstack/react-query";
import { useApi, useData } from "@/entities/session/api/client";
import { useSession } from "@/entities/session/store";
import {
  Avatar,
  ErrorText,
  Hero,
  Icon,
  PROJECT_NAME,
  QueryState,
} from "@/shared/ui/common";

import { BackendSwitch } from "@/entities/session/BackendSwitch";

export function LoginPage() {
  const api = useApi(),
    signIn = useSession((state) => state.signIn),
    backend = useSession((state) => state.backend);
  const users = useData(["users"], api.auth.users);
  const login = useMutation({
    mutationFn: api.auth.login,
    onSuccess: (session) => {
      if (useSession.getState().backend === backend)
        signIn(session.access_token, session.user);
    },
  });
  return (
    <main className="login">
      <div className="login-inner">
        <header className="login-top">
          <img src="/assets/logo.svg" alt="Авито" />
          <span>{PROJECT_NAME}</span>
          <BackendSwitch />
        </header>
        <section className="login-hero">
          <div>
            <h1>
              Кто вы сегодня<span className="blue-period">?</span>
            </h1>
            <p className="lead">
              Выберите тестового пользователя. Права и экраны зависят от роли.
            </p>
          </div>
          <Hero />
        </section>
        <ErrorText error={login.error} />
        <QueryState query={users}>
          {(users) => (
            <div className="login-grid">
              {users.map((user) => (
                <button
                  className="user-choice"
                  key={user.id}
                  disabled={!user.can_login || login.isPending}
                  onClick={() => login.mutate(user.id)}
                >
                  <Avatar
                    name={user.name}
                    size="lg"
                    color={
                      user.id === "dima" || user.id === "maria"
                        ? "blue"
                        : "purple"
                    }
                  />
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.title}</small>
                    <small>
                      {user.id === "anya"
                        ? "День 12 · основной сценарий"
                        : user.id === "dima"
                          ? "День 4 · сегодня в отгуле"
                          : user.role === "lead"
                            ? "Экран лида не предусмотрен"
                            : "Прогресс, задачи и заявки"}
                    </small>
                  </span>
                  {user.can_login && <Icon name="arrow" />}
                </button>
              ))}
            </div>
          )}
        </QueryState>
        <p className="sb-test">Тестовые данные, не регламенты Авито</p>
      </div>
    </main>
  );
}
