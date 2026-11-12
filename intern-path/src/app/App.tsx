import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import { useSession } from "@/entities/session/store";
import { clearAssistant } from "@/features/assistant/useAssistant";
import { LoginPage } from "@/pages/login/LoginPage";
import { HomePage } from "@/pages/home/HomePage";
import { ChatPage } from "@/pages/chat/ChatPage";
import { TaskPage, TasksPage } from "@/pages/task/TaskPages";
import { JournalPage } from "@/pages/journal/JournalPage";
import { ContactsPage } from "@/pages/contacts/ContactsPage";
import { PrivacyPage } from "@/pages/privacy/PrivacyPage";
import { MentorPage } from "@/pages/mentor/MentorPage";
import { ToolsPage } from "@/pages/tools/ToolsPage";
import { ActionsPage } from "@/pages/actions/ActionsPage";
import { Shell } from "@/widgets/shell/Shell";
import { useNavigation } from "@/shared/ui/navigation";
import { Dialog, ErrorText } from "@/shared/ui/common";
import { ApiError } from "@/shared/api/transport";

function Authenticated() {
  const user = useSession((state) => state.user);
  const { route } = useNavigation();
  const api = useApi(),
    profile = useData(["me"], api.auth.me),
    update = useUpdate();
  const cache = useQueryClient(),
    signOut = useSession((state) => state.signOut);
  useEffect(() => {
    if (profile.error instanceof ApiError && profile.error.status === 401) {
      cache.clear();
      signOut();
    }
  }, [profile.error, cache, signOut]);
  const current = profile.data ?? user;
  if (!current) return null;
  const intern = current.role === "intern";
  const page =
    route.page === "tools" ? (
      <ToolsPage user={current} />
    ) : current.role === "mentor" ? (
      <MentorPage />
    ) : current.role === "lead" ? (
      <div className="page">
        <h1>Экран лида не предусмотрен</h1>
      </div>
    ) : route.page === "chat" ? (
      <ChatPage id={route.id} />
    ) : route.page === "task" ? (
      <TaskPage id={route.id} />
    ) : route.page === "tasks" ? (
      <TasksPage />
    ) : route.page === "journal" ? (
      <JournalPage />
    ) : route.page === "contacts" ? (
      <ContactsPage />
    ) : route.page === "privacy" ? (
      <PrivacyPage />
    ) : route.page === "actions" ? (
      <ActionsPage />
    ) : (
      <HomePage user={current} />
    );
  function acknowledge() {
    if (!update.isPending) update.mutate(api.auth.acknowledge);
  }
  return (
    <Shell user={current}>
      {page}
      {profile.error && <ErrorText error={profile.error} />}
      {intern && current.privacy?.seen_privacy === false && (
        <Dialog title="Ваши чаты видите только вы" onClose={acknowledge}>
          <p className="intro">{current.privacy.first_entry_text}</p>
          <ErrorText error={update.error} />
          <button
            className="btn primary"
            disabled={update.isPending}
            onClick={acknowledge}
          >
            Понятно
          </button>
        </Dialog>
      )}
    </Shell>
  );
}
export function App() {
  const { backend, token } = useSession();
  useEffect(() => {
    clearAssistant();
    useNavigation.getState().go({
      page: useSession.getState().user?.role === "mentor" ? "mentor" : "home",
    });
    return clearAssistant;
  }, [backend, token]);
  return token ? (
    <Authenticated key={backend + token} />
  ) : (
    <LoginPage key={backend} />
  );
}
