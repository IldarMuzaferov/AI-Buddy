import { z } from "zod";
import * as schema from "../contracts";
import { now, people, uid, type InternData } from "./data";
import {
  conflict,
  empty,
  invalid,
  json,
  object,
  parse,
  required,
  string,
} from "./http";
import type { RequestMethod } from "../transport";

const newContact = z.object({
  person_id: string.optional(),
  source_chat_id: string.optional(),
  name: string.optional(),
  role: z.string().optional(),
  team: z.string().optional(),
  topics: z.string().array().optional(),
  note: z.string().optional(),
  how_to_ask: z.string().optional(),
});
const newEntry = z.object({ text: string, source_chat_id: string.optional() });
const journalNote =
  "Запись остаётся в журнале, даже если удалить чат. Вы сами выбираете, что экспортировать и чем поделиться с наставником.";

export async function records(
  data: InternData,
  resource: string,
  id: string | undefined,
  method: RequestMethod,
  body: unknown,
  search: URLSearchParams,
) {
  if (resource === "contacts") {
    if (method === "GET") {
      const query = (search.get("q") ?? "").toLowerCase();
      return json(
        data.contacts.filter((contact) =>
          [
            contact.name,
            contact.role,
            contact.team,
            contact.note,
            ...contact.topics,
          ].some((value) => value?.toLowerCase().includes(query)),
        ),
      );
    }
    if (method === "POST") {
      const fields = parse(newContact, body);
      if (
        fields.person_id &&
        data.contacts.some((contact) => contact.person_id === fields.person_id)
      )
        throw conflict("Этот человек уже сохранён.");
      const person = fields.person_id
        ? required(people[fields.person_id as keyof typeof people])
        : undefined;
      const chat = fields.source_chat_id
        ? required(data.chats.find((chat) => chat.id === fields.source_chat_id))
        : undefined;
      const contact = {
        ...fields,
        id: uid(),
        name: person?.name ?? fields.name ?? "",
        role: person?.role ?? fields.role,
        team: person?.team ?? fields.team,
        topics: person?.topics ?? fields.topics ?? [],
        source_chat_title: chat?.title,
        created_at: now(),
      };
      if (!contact.name) throw invalid("Укажите имя.");
      data.contacts.unshift(contact);
      return json(contact, 201);
    }
    const contact = required(data.contacts.find((item) => item.id === id));
    if (method === "PATCH") {
      Object.assign(
        contact,
        parse(
          schema.contact
            .pick({
              note: true,
              role: true,
              team: true,
              topics: true,
              how_to_ask: true,
            })
            .partial(),
          body,
        ),
      );
      return json(contact);
    }
    if (method === "DELETE") {
      data.contacts = data.contacts.filter((item) => item.id !== id);
      return empty();
    }
  }
  if (resource === "journal") {
    if (method === "GET" && !id)
      return json({ note: journalNote, entries: data.entries });
    if (method === "POST" && id === "suggest") {
      const { chat_ids } = parse(z.object({ chat_ids: string.array() }), body);
      const items = chat_ids.flatMap((id) => {
        const chat = required(data.chats.find((chat) => chat.id === id));
        const answer = data.messages.find(
          (message) =>
            message.chat_id === chat.id &&
            message.role === "assistant" &&
            message.route !== "error",
        );
        return answer
          ? [
              {
                chat_id: id,
                chat_title: chat.title,
                text: `Разобрался с вопросом «${chat.title}». ${answer.content.split("\n")[0]}`,
              },
            ]
          : [];
      });
      return json({
        items,
        empty_text: "В выбранных чатах пока нет материала для записи.",
      });
    }
    if (method === "POST" && !id) {
      const { entries } = parse(z.object({ entries: newEntry.array() }), body);
      const saved = entries.map((entry) => {
        const chat = entry.source_chat_id
          ? required(
              data.chats.find((chat) => chat.id === entry.source_chat_id),
            )
          : undefined;
        return {
          ...entry,
          id: uid(),
          source_chat_title: chat?.title,
          source_label: chat ? `Из чата «${chat.title}»` : "Добавлено вручную",
          chat_deleted: false,
          include_in_export: true,
          shared_with_mentor: false,
          created_at: now(),
        };
      });
      data.entries.unshift(...saved);
      return json({ entries: saved }, 201);
    }
    if (method === "POST" && id === "draft") {
      const { entry_ids } = parse(
        z.object({ entry_ids: string.array() }),
        body,
      );
      const selected = entry_ids.length
        ? entry_ids.map((id) =>
            required(data.entries.find((entry) => entry.id === id)),
          )
        : data.entries.filter((entry) => entry.include_in_export);
      return json({
        text: selected.map((entry) => entry.text).join("\n\n"),
        entry_ids: selected.map((entry) => entry.id),
      });
    }
    if (method === "POST" && id === "export") {
      const { text, title } = parse(
        z.object({ text: string, title: string.optional() }),
        body,
      );
      const { makePdf } = await import("./pdf");
      return makePdf(text, title ?? "Журнал достижений");
    }
    const entry = required(data.entries.find((item) => item.id === id));
    if (method === "PATCH") {
      Object.assign(
        entry,
        parse(
          schema.journalEntry
            .pick({
              text: true,
              include_in_export: true,
              shared_with_mentor: true,
            })
            .partial(),
          body,
        ),
      );
      return json(entry);
    }
    if (method === "DELETE") {
      data.entries = data.entries.filter((item) => item.id !== id);
      return empty();
    }
  }
  if (resource === "actions") {
    if (method === "GET" && !id)
      return json(
        data.actions.filter(
          (action) => !search.get("type") || action.type === search.get("type"),
        ),
      );
    const action = required(data.actions.find((item) => item.id === id));
    return json(action);
  }
  if (resource === "events") return json(parse(object, body), 202);
  return undefined;
}
