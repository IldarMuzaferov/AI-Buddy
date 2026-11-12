import { useState } from "react";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import type { Chat, JournalEntry } from "@/shared/api/contracts";
import {
  dateLabel,
  Dialog,
  download,
  Empty,
  ErrorText,
  formText,
  Icon,
  QueryState,
} from "@/shared/ui/common";
import { useNavigation } from "@/shared/ui/navigation";

function EntryForm({
  entry,
  onClose,
}: {
  entry?: JournalEntry;
  onClose: () => void;
}) {
  const api = useApi(),
    update = useUpdate();
  return (
    <Dialog
      title={entry ? "Редактировать запись" : "Новая запись"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = formText(new FormData(event.currentTarget), "text");
          if (!text) return;
          update.mutate(async () => {
            if (entry) await api.journal.edit(entry.id, { text });
            else await api.journal.add([{ text }]);
            onClose();
          });
        }}
      >
        <label className="field">
          Что удалось сделать?
          <textarea
            name="text"
            autoFocus
            rows={5}
            required
            defaultValue={entry?.text}
          />
        </label>
        <ErrorText error={update.error} />
        <button className="btn primary" disabled={update.isPending}>
          Сохранить
        </button>
      </form>
    </Dialog>
  );
}
interface Suggestion {
  text: string;
  chat_id: string;
  chat_title: string;
  selected: boolean;
}
function SuggestionsForm({
  chats,
  onClose,
}: {
  chats: Chat[];
  onClose: () => void;
}) {
  const api = useApi(),
    update = useUpdate();
  const [chatIds, setChatIds] = useState(() =>
    chats.filter((chat) => chat.include_in_journal).map((chat) => chat.id),
  );
  const [suggestions, setSuggestions] = useState<Suggestion[]>(),
    [emptyText, setEmptyText] = useState("");
  return (
    <Dialog title="Собрать записи из чатов" onClose={onClose}>
      <ErrorText error={update.error} />
      {!suggestions ? (
        <>
          <div className="selection-list">
            {chats.map((chat) => (
              <label className="selection-item" key={chat.id}>
                <input
                  type="checkbox"
                  checked={chatIds.includes(chat.id)}
                  onChange={(event) =>
                    setChatIds((current) =>
                      event.target.checked
                        ? [...current, chat.id]
                        : current.filter((id) => id !== chat.id),
                    )
                  }
                />
                <span>{chat.title}</span>
              </label>
            ))}
          </div>
          <button
            className="btn primary"
            disabled={update.isPending || !chatIds.length}
            onClick={() =>
              update.mutate(async () => {
                const result = await api.journal.suggest(chatIds);
                setSuggestions(
                  result.items.map((item) => ({ ...item, selected: true })),
                );
                setEmptyText(result.empty_text ?? "");
              })
            }
          >
            Предложить записи
          </button>
        </>
      ) : (
        <>
          {!suggestions.length && (
            <p>{emptyText || "Подходящих записей пока нет."}</p>
          )}
          {suggestions.map((item, index) => (
            <div className="panel" key={index}>
              <label className="selection-item">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={(event) =>
                    setSuggestions((current) =>
                      current?.map((suggestion, position) =>
                        position === index
                          ? { ...suggestion, selected: event.target.checked }
                          : suggestion,
                      ),
                    )
                  }
                />
                <span>{item.chat_title}</span>
              </label>
              <label className="field">
                Текст записи
                <textarea
                  rows={4}
                  value={item.text}
                  onChange={(event) =>
                    setSuggestions((current) =>
                      current?.map((suggestion, position) =>
                        position === index
                          ? { ...suggestion, text: event.target.value }
                          : suggestion,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
          <div className="actions">
            <button className="btn" onClick={() => setSuggestions(undefined)}>
              Выбрать другие чаты
            </button>
            <button
              className="btn primary"
              disabled={
                update.isPending ||
                !suggestions.some((item) => item.selected && item.text.trim())
              }
              onClick={() =>
                update.mutate(async () => {
                  await api.journal.add(
                    suggestions
                      .filter((item) => item.selected && item.text.trim())
                      .map((item) => ({
                        text: item.text.trim(),
                        source_chat_id: item.chat_id,
                      })),
                  );
                  onClose();
                })
              }
            >
              Сохранить выбранные
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
function ExportForm({
  initialText,
  onClose,
}: {
  initialText: string;
  onClose: () => void;
}) {
  const api = useApi(),
    update = useUpdate();
  return (
    <Dialog title="Экспорт журнала" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          update.mutate(async () =>
            download(
              await api.journal.export({
                text: formText(form, "text"),
                title: formText(form, "title") || undefined,
              }),
              "journal.pdf",
            ),
          );
        }}
      >
        <label className="field">
          Заголовок
          <input name="title" defaultValue="Журнал достижений" />
        </label>
        <label className="field">
          Текст PDF
          <textarea name="text" rows={10} defaultValue={initialText} required />
        </label>
        <ErrorText error={update.error} />
        <button className="btn primary" disabled={update.isPending}>
          <Icon name="download" />
          Скачать PDF
        </button>
      </form>
    </Dialog>
  );
}
export function JournalPage() {
  const api = useApi(),
    update = useUpdate(),
    go = useNavigation((state) => state.go);
  const journal = useData(["journal"], api.journal.list),
    chats = useData(["chats"], api.chats.list);
  const [entry, setEntry] = useState<JournalEntry | "new">(),
    [suggest, setSuggest] = useState(false),
    [draft, setDraft] = useState<string>();
  const allChats = chats.data
    ? [
        ...chats.data.history,
        ...chats.data.tasks.flatMap((folder) => folder.chats),
      ]
    : [];
  return (
    <div className="page">
      <h1>Журнал достижений</h1>
      <div className="actions section-actions">
        <button className="btn primary" onClick={() => setEntry("new")}>
          <Icon name="plus" />
          Добавить запись
        </button>
        <button
          className="btn"
          disabled={!allChats.length}
          onClick={() => setSuggest(true)}
        >
          Собрать из чатов
        </button>
        <button
          className="btn"
          disabled={
            !journal.data?.entries.some((entry) => entry.include_in_export) ||
            update.isPending
          }
          onClick={() =>
            update.mutate(async () =>
              setDraft((await api.journal.draft([])).text),
            )
          }
        >
          <Icon name="download" />
          Подготовить PDF
        </button>
      </div>
      <ErrorText error={update.error ?? chats.error} />
      <QueryState query={journal}>
        {(data) => (
          <>
            <p className="lead">{data.note}</p>
            {data.entries.length ? (
              data.entries.map((entry) => (
                <article className="panel" key={entry.id}>
                  <p className="pre-line">{entry.text}</p>
                  <p className="muted">
                    {entry.source_label} · {dateLabel(entry.created_at)}
                  </p>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={entry.include_in_export}
                      disabled={update.isPending}
                      onChange={(event) =>
                        update.mutate(() =>
                          api.journal.edit(entry.id, {
                            include_in_export: event.target.checked,
                          }),
                        )
                      }
                    />
                    Включать в экспорт
                  </label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={entry.shared_with_mentor}
                      disabled={update.isPending}
                      onChange={(event) =>
                        update.mutate(() =>
                          api.journal.edit(entry.id, {
                            shared_with_mentor: event.target.checked,
                          }),
                        )
                      }
                    />
                    Показывать наставнику
                  </label>
                  <div className="actions">
                    {!entry.chat_deleted && entry.source_chat_id && (
                      <button
                        className="btn small"
                        onClick={() =>
                          entry.source_chat_id &&
                          go({ page: "chat", id: entry.source_chat_id })
                        }
                      >
                        К чату
                      </button>
                    )}
                    <button
                      className="btn small"
                      onClick={() => setEntry(entry)}
                    >
                      Изменить
                    </button>
                    <button
                      className="btn small"
                      disabled={update.isPending}
                      onClick={() => {
                        if (window.confirm("Удалить запись из журнала?"))
                          update.mutate(() => api.journal.remove(entry.id));
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <Empty
                title="Журнал пока пуст"
                text="Добавьте запись вручную или соберите её из чатов."
              />
            )}
          </>
        )}
      </QueryState>
      {entry && (
        <EntryForm
          entry={entry === "new" ? undefined : entry}
          onClose={() => setEntry(undefined)}
        />
      )}
      {suggest && (
        <SuggestionsForm chats={allChats} onClose={() => setSuggest(false)} />
      )}
      {draft !== undefined && (
        <ExportForm initialText={draft} onClose={() => setDraft(undefined)} />
      )}
    </div>
  );
}
