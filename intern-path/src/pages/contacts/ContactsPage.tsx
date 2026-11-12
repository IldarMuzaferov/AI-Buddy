import { useState } from "react";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import type { Contact } from "@/shared/api/contracts";
import {
  Avatar,
  Dialog,
  Empty,
  ErrorText,
  formText,
  Icon,
  QueryState,
  splitList,
} from "@/shared/ui/common";
import { useNavigation } from "@/shared/ui/navigation";

function ContactForm({
  contact,
  onClose,
}: {
  contact?: Contact;
  onClose: () => void;
}) {
  const api = useApi(),
    update = useUpdate();
  return (
    <Dialog
      title={contact ? "Изменить знакомство" : "Добавить знакомство"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const fields = {
            role: formText(form, "role"),
            team: formText(form, "team"),
            topics: splitList(formText(form, "topics")),
            note: formText(form, "note"),
          };
          update.mutate(async () => {
            if (contact)
              await api.contacts.edit(contact.id, {
                ...fields,
                how_to_ask: formText(form, "how_to_ask"),
              });
            else
              await api.contacts.create({
                ...fields,
                name: formText(form, "name"),
              });
            onClose();
          });
        }}
      >
        {contact ? (
          <p>{contact.name}</p>
        ) : (
          <label className="field">
            Имя
            <input name="name" autoFocus required />
          </label>
        )}
        <label className="field">
          Роль
          <input name="role" defaultValue={contact?.role ?? ""} />
        </label>
        <label className="field">
          Команда
          <input name="team" defaultValue={contact?.team ?? ""} />
        </label>
        <label className="field">
          Темы через запятую
          <input name="topics" defaultValue={contact?.topics.join(", ")} />
        </label>
        {contact && (
          <label className="field">
            Как обратиться
            <textarea
              name="how_to_ask"
              defaultValue={contact.how_to_ask ?? ""}
            />
          </label>
        )}
        <label className="field">
          Заметка
          <textarea name="note" defaultValue={contact?.note ?? ""} />
        </label>
        <ErrorText error={update.error} />
        <button className="btn primary" disabled={update.isPending}>
          Сохранить
        </button>
      </form>
    </Dialog>
  );
}
export function ContactsPage() {
  const api = useApi(),
    update = useUpdate(),
    go = useNavigation((state) => state.go);
  const [search, setSearch] = useState(""),
    [form, setForm] = useState<Contact | "new">();
  const contacts = useData(["contacts", search], () =>
    api.contacts.list(search),
  );
  return (
    <div className="page">
      <div className="section-heading">
        <h1>Знакомства</h1>
        <button className="btn primary" onClick={() => setForm("new")}>
          <Icon name="plus" />
          Добавить
        </button>
      </div>
      <p className="lead">
        Здесь можно сохранить, к кому обратиться и с каким вопросом. Список
        видите только вы.
      </p>
      <label className="field">
        Поиск по имени, роли, теме или заметке
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <ErrorText error={update.error} />
      <QueryState query={contacts}>
        {(items) =>
          items.length ? (
            <div className="people-grid">
              {items.map((contact) => (
                <article className="panel" key={contact.id}>
                  <div className="panel-heading">
                    <Avatar name={contact.name} />
                    <div>
                      <h3>{contact.name}</h3>
                      <p className="muted">
                        {[contact.role, contact.team]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="chips">
                    {contact.topics.map((topic) => (
                      <span key={topic} className="chip">
                        {topic}
                      </span>
                    ))}
                  </div>
                  <p className="pre-line">{contact.note}</p>
                  {contact.how_to_ask && (
                    <details>
                      <summary>Как обратиться</summary>
                      <p className="pre-line">{contact.how_to_ask}</p>
                      <button
                        className="btn small"
                        onClick={() =>
                          update.mutate(() =>
                            navigator.clipboard.writeText(
                              contact.how_to_ask ?? "",
                            ),
                          )
                        }
                      >
                        Скопировать
                      </button>
                    </details>
                  )}
                  {contact.source_chat_title && (
                    <p className="muted">
                      Источник: {contact.source_chat_title}
                    </p>
                  )}
                  <div className="actions">
                    {contact.source_chat_id && (
                      <button
                        className="btn small"
                        onClick={() =>
                          contact.source_chat_id &&
                          go({ page: "chat", id: contact.source_chat_id })
                        }
                      >
                        К чату
                      </button>
                    )}
                    <button
                      className="btn small"
                      onClick={() => setForm(contact)}
                    >
                      Изменить
                    </button>
                    <button
                      className="btn small"
                      disabled={update.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Удалить знакомство «${contact.name}»?`,
                          )
                        )
                          update.mutate(() => api.contacts.remove(contact.id));
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title={search ? "Ничего не найдено" : "Знакомств пока нет"}
              text={
                search
                  ? undefined
                  : "Добавьте человека вручную или из ответа ассистента."
              }
            />
          )
        }
      </QueryState>
      {form && (
        <ContactForm
          contact={form === "new" ? undefined : form}
          onClose={() => setForm(undefined)}
        />
      )}
    </div>
  );
}
