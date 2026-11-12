import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import { Composer } from "@/features/assistant/Composer";
import { useStream } from "@/features/assistant/useAssistant";
import { Dialog, ErrorText, Icon, QueryState } from "@/shared/ui/common";
import { useNavigation } from "@/shared/ui/navigation";
import { TaskSummary } from "@/widgets/shell/TaskSummary";
import {
  Block,
  MessageRow,
  Sources,
} from "@/widgets/conversation/MessageContent";

function LiveAnswer({ id }: { id: string }) {
  const stream = useStream();
  if (stream.chatId !== id) return null;
  if (!stream.pending)
    return (
      <>
        <ErrorText error={stream.error} />
        {stream.retry && (
          <button className="btn small" onClick={() => void stream.retry?.()}>
            Повторить отправку
          </button>
        )}
      </>
    );
  const status = stream.events.filter((event) => event.name === "status");
  const answer = stream.events
    .flatMap((event) => (event.name === "token" ? [event.data.text] : []))
    .join("");
  const sources = stream.events.flatMap((event) =>
    event.name === "source" ? [event.data] : [],
  );
  return (
    <div aria-live="polite">
      {(stream.question || stream.filename) && (
        <div className="msg-user">
          {stream.filename && (
            <span className="file-chip">{stream.filename}</span>
          )}
          {stream.question && (
            <div className="bubble pre-line">{stream.question}</div>
          )}
        </div>
      )}
      <div className="msg-ai">
        <div className="ai-mark">
          <Icon name="spark" />
        </div>
        <div>
          <p className="muted">
            {status.at(-1)?.data.text ?? "Отправляю вопрос…"}
          </p>
          <div className="answer-text">
            <Markdown>{answer}</Markdown>
          </div>
          {sources.length > 0 && <Sources items={sources} />}
          {stream.events.map((event, index) =>
            [
              "person_card",
              "action_draft",
              "conflict",
              "practice",
              "next_step",
              "notice",
              "error",
            ].includes(event.name) ? (
              <Block
                key={index}
                value={{ type: event.name, ...event.data }}
                chatId={id}
              />
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatPage({ id }: { id: string }) {
  const api = useApi(),
    chat = useData(["chat", id], () => api.chats.messages(id)),
    update = useUpdate(),
    go = useNavigation((state) => state.go);
  const stream = useStream(),
    end = useRef<HTMLDivElement>(null),
    followedChat = useRef<string>(null);
  const [rename, setRename] = useState(false),
    [title, setTitle] = useState("");
  useEffect(() => {
    if (!chat.data && !stream.pending) return;
    const container = end.current?.closest(".content");
    if (
      followedChat.current !== id ||
      stream.pending ||
      (container &&
        container.scrollHeight - container.scrollTop - container.clientHeight <
          270)
    ) {
      end.current?.scrollIntoView({ block: "end" });
      followedChat.current = id;
    }
  }, [
    id,
    chat.data?.messages.length,
    stream.events.length,
    stream.pending,
    chat.data,
  ]);
  return (
    <div className="chat-page page">
      {chat.data ? (
        <>
          <div className="section-heading">
            <h1>{chat.data.chat.title}</h1>
            <div className="actions">
              <button
                className="icon-button"
                aria-label="Переименовать чат"
                disabled={update.isPending || stream.pending}
                onClick={() => {
                  setTitle(chat.data?.chat.title ?? "");
                  setRename(true);
                }}
              >
                <Icon name="edit" />
              </button>
              <button
                className="icon-button"
                aria-label="Удалить чат"
                disabled={update.isPending || stream.pending}
                onClick={() => {
                  if (window.confirm("Удалить чат и его вложения?"))
                    update.mutate(async () => {
                      await api.chats.remove(id);
                      go({ page: "home" });
                    });
                }}
              >
                <Icon name="trash" />
              </button>
            </div>
          </div>
          <label className="step-check">
            <input
              type="checkbox"
              checked={chat.data.chat.include_in_journal}
              disabled={update.isPending}
              onChange={(event) =>
                update.mutate(() =>
                  api.chats.edit(id, {
                    include_in_journal: event.target.checked,
                  }),
                )
              }
            />
            Учитывать в журнале
          </label>
          {chat.data.task && <TaskSummary task={chat.data.task} />}
          <ErrorText error={update.error} />
          <div className="chat-messages">
            {chat.data.messages
              .filter((message) => {
                if (stream.chatId !== id || !stream.pending) return true;
                const completed = stream.events.find(
                  (event) => event.name === "done",
                );
                if (completed?.data.message_id === message.id) return false;
                const index = chat.data?.messages.indexOf(message);
                const next =
                  index === undefined
                    ? undefined
                    : chat.data?.messages[index + 1];
                return !(
                  message.role === "user" &&
                  next?.id === completed?.data.message_id &&
                  message.content === stream.question
                );
              })
              .map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  locked={chat.data?.task?.locked}
                />
              ))}
          </div>
        </>
      ) : stream.pending && stream.chatId === id ? null : (
        <QueryState query={chat}>{() => null}</QueryState>
      )}
      <LiveAnswer id={id} />
      {chat.data && (
        <div className="chat-compose">
          <Composer
            chatId={id}
            initialMode={chat.data.chat.mode}
            locked={chat.data.task?.locked}
          />
        </div>
      )}
      <div ref={end} />
      {rename && (
        <Dialog title="Переименовать чат" onClose={() => setRename(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim())
                update.mutate(async () => {
                  await api.chats.edit(id, { title: title.trim() });
                  setRename(false);
                });
            }}
          >
            <label className="field">
              Название
              <input
                autoFocus
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <ErrorText error={update.error} />
            <button className="btn primary" disabled={update.isPending}>
              Сохранить
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
