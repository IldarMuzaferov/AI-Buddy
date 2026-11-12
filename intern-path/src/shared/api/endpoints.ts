import { z } from "zod";
import * as schema from "./contracts";
import { createTransport, type ApiContext } from "./transport";

const pathId = encodeURIComponent;
const query = (value: string) => encodeURIComponent(value);
const opaque = z.unknown();
const ok = z.object({ unread: z.number() });
export const eventName = z.enum([
  "chat_created",
  "message_sent",
  "answer_helpful",
  "answer_not_helpful",
  "direct_answer_clicked",
  "person_card_shown",
  "contact_saved",
  "access_draft_shown",
  "access_confirmed",
  "access_granted",
  "conflict_shown",
  "conflict_reported",
  "practice_generated",
  "practice_done",
  "checklist_step_done",
  "journal_entry_added",
  "journal_exported",
  "privacy_opened",
]);
const contactEdit = schema.contact
  .pick({ note: true, role: true, team: true, topics: true, how_to_ask: true })
  .partial();
const journalEdit = schema.journalEntry
  .pick({ text: true, include_in_export: true, shared_with_mentor: true })
  .partial();
export function createApi(context: ApiContext) {
  const { json, empty, blob, text, stream } = createTransport(context);
  const post = (body?: unknown) => ({ method: "POST" as const, body });
  const patch = (body: unknown) => ({ method: "PATCH" as const, body });
  const remove = { method: "DELETE" as const };
  return {
    auth: {
      users: () => json("/auth/users", schema.userChoice.array()),
      login: (user_id: string) =>
        json("/auth/login", schema.login, post({ user_id })),
      me: () => json("/me", schema.profile),
      acknowledge: () =>
        json(
          "/me/privacy-ack",
          z.object({ seen_privacy: z.boolean() }),
          post(),
        ),
    },
    home: () => json("/home", schema.home),
    checklist: {
      list: () => json("/checklist", schema.checklist),
      set: (id: string, status: schema.StepStatus) =>
        json(
          `/checklist/${pathId(id)}`,
          z.object({ step_id: z.string(), status: schema.stepStatus }),
          patch({ status }),
        ),
      generate: (id: string) =>
        json(`/checklist/${pathId(id)}/practice`, schema.practice, post()),
    },
    practice: {
      list: () => json("/practice", schema.practiceItem.array()),
      set: (id: string, status: "open" | "done") =>
        json(`/practice/${pathId(id)}`, schema.practiceItem, patch({ status })),
    },
    notifications: {
      list: () => json("/notifications", schema.notifications),
      read: (id: string) =>
        json(`/notifications/${pathId(id)}/read`, schema.notification, post()),
      readAll: () => json("/notifications/read-all", ok, post()),
    },
    chats: {
      list: () => json("/chats", schema.chatList),
      create: (body: { task_id?: string; title?: string } = {}) =>
        json("/chats", schema.chat, post(body)),
      edit: (
        id: string,
        body: Partial<
          Pick<schema.Chat, "title" | "include_in_journal" | "mode">
        >,
      ) => json(`/chats/${pathId(id)}`, schema.chat, patch(body)),
      remove: (id: string) => empty(`/chats/${pathId(id)}`, remove),
      messages: (id: string) =>
        json(`/chats/${pathId(id)}/messages`, schema.messages),
      attach: (id: string, file: File, signal?: AbortSignal) => {
        const form = new FormData();
        form.append("file", file);
        return json(`/chats/${pathId(id)}/attachments`, schema.attachment, {
          ...post(form),
          signal,
        });
      },
      send: (
        id: string,
        body: {
          text: string;
          mode: schema.ReplyMode;
          attachment_ids: string[];
        },
        key: string,
        onEvent: (event: schema.StreamEvent) => void,
        signal: AbortSignal,
      ) =>
        stream(
          `/chats/${pathId(id)}/messages`,
          { ...post(body), idempotencyKey: key, signal },
          onEvent,
        ),
      feedback: (id: string, helpful: boolean) =>
        json(
          `/messages/${pathId(id)}/feedback`,
          z.object({
            message_id: z.string(),
            feedback: z.enum(["yes", "no"]),
            chat_unresolved: z.boolean(),
          }),
          post({ helpful }),
        ),
      followUp: (
        id: string,
        kind: "direct" | "retry",
        onEvent: (event: schema.StreamEvent) => void,
        signal: AbortSignal,
      ) =>
        stream(
          `/messages/${pathId(id)}/${kind}`,
          { ...post(), signal },
          onEvent,
        ),
    },
    tasks: {
      list: () => json("/tasks", schema.task.array()),
      get: (id: string) => json(`/tasks/${pathId(id)}`, schema.taskDetail),
    },
    actions: {
      presets: () =>
        json(
          "/access/presets",
          z.object({
            team: z.string(),
            fields: schema.field.array(),
            defaults: schema.payload,
            levels: z.array(z.unknown()),
          }),
        ),
      list: (type?: schema.ActionType) =>
        json(
          `/actions${type ? `?type=${query(type)}` : ""}`,
          schema.action.array(),
        ),
      get: (id: string) => json(`/actions/${pathId(id)}`, schema.action),
      edit: (id: string, body: schema.Payload) =>
        json(`/actions/${pathId(id)}`, schema.action, patch(body)),
      confirm: (id: string) =>
        json(`/actions/${pathId(id)}/confirm`, schema.action, post()),
      cancel: (id: string) =>
        json(`/actions/${pathId(id)}/cancel`, schema.action, post()),
      reminder: (id: string) =>
        json(
          `/actions/${pathId(id)}/reminder`,
          z.object({
            text: z.string(),
            channel: z.string(),
            sent: z.boolean(),
          }),
        ),
    },
    contacts: {
      list: (search = "") =>
        json(`/contacts?q=${query(search)}`, schema.contact.array()),
      create: (
        body:
          | { person_id: string; how_to_ask?: string; source_chat_id: string }
          | {
              name: string;
              role: string;
              team: string;
              topics: string[];
              note: string;
            },
      ) => json("/contacts", schema.contact, post(body)),
      edit: (id: string, body: z.infer<typeof contactEdit>) =>
        json(`/contacts/${pathId(id)}`, schema.contact, patch(body)),
      remove: (id: string) => empty(`/contacts/${pathId(id)}`, remove),
    },
    journal: {
      list: () => json("/journal", schema.journal),
      suggest: (chat_ids: string[]) =>
        json(
          "/journal/suggest",
          z.object({
            items: schema.suggestion.array(),
            empty_text: z.string().nullish(),
          }),
          post({ chat_ids }),
        ),
      add: (entries: { text: string; source_chat_id?: string }[]) =>
        json(
          "/journal",
          schema.journal.pick({ entries: true }),
          post({ entries }),
        ),
      edit: (id: string, body: z.infer<typeof journalEdit>) =>
        json(`/journal/${pathId(id)}`, schema.journalEntry, patch(body)),
      remove: (id: string) => empty(`/journal/${pathId(id)}`, remove),
      draft: (entry_ids: string[]) =>
        json(
          "/journal/draft",
          z.object({ text: z.string(), entry_ids: z.string().array() }),
          post({ entry_ids }),
        ),
      export: (body: { text: string; title?: string }) =>
        blob("/journal/export", post(body)),
    },
    privacy: {
      get: () => json("/privacy", schema.privacy),
      set: (share_topics: boolean) =>
        json("/privacy/settings", schema.privacySettings, {
          method: "PUT",
          body: { share_topics },
        }),
      clear: () =>
        json(
          "/privacy/chats",
          z.object({ deleted: z.number(), kept: z.string() }),
          remove,
        ),
    },
    mentor: {
      interns: () => json("/mentor/interns", schema.mentor),
      createTask: (body: {
        intern_id: string;
        title: string;
        description: string;
        deadline: string;
      }) => json("/mentor/tasks", schema.task, post(body)),
    },
    system: {
      health: () =>
        json(
          "/health",
          z.object({
            status: z.string(),
            db: opaque,
            mcp: opaque,
            llm_provider: opaque,
            dev_mode: z.boolean(),
          }),
        ),
      flags: () =>
        json(
          "/flags",
          z.object({ guide_mode_default: schema.replyMode.optional() }),
        ),
      event: (name: z.infer<typeof eventName>, props: schema.Payload = {}) =>
        empty("/events", post({ name, props })),
      search: (search: string) =>
        json(`/knowledge/search?q=${query(search)}`, opaque),
      summary: () => json("/metrics/summary", opaque),
      metrics: () => text("/metrics"),
    },
    dev: {
      createTask: (body: {
        intern_id: string;
        title: string;
        description?: string;
        deadline?: string;
      }) => json("/dev/tracker/create-task", opaque, post(body)),
      updateTask: (body: {
        task_id: string;
        status?: schema.TaskStatus;
        deadline?: string;
        description?: string;
        shift_days?: number;
      }) => json("/dev/tracker/update-task", opaque, post(body)),
      approve: (action_id: string) =>
        json("/dev/access/approve", opaque, post({ action_id })),
      reject: (action_id: string, reason?: string) =>
        json("/dev/access/reject", opaque, post({ action_id, reason })),
      advance: (intern_id: string, days: number) =>
        json("/dev/advance-day", opaque, post({ intern_id, days })),
      failNext: (enabled: boolean) =>
        json("/dev/llm/fail-next", opaque, post({ enabled })),
      sync: () => json("/dev/sync", opaque, post()),
      reset: () => json("/dev/reset", opaque, post()),
    },
  };
}
