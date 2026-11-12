import { z } from "zod";

const text = z.string();
const id = text.min(1);
const optionalText = text.nullish();
const date = text;
const object = z.looseObject({});
const role = z.enum(["intern", "mentor", "lead"]);
export const replyMode = z.enum(["guide", "direct"]);
export const stepStatus = z.enum(["todo", "in_progress", "done", "hidden"]);
export const practiceStatus = z.enum(["open", "done"]);
export const taskStatus = z.enum(["new", "in_progress", "review", "done"]);
export const stage = z.object({ id, label: text });
export const userChoice = z.object({
  id,
  name: text,
  title: text,
  role,
  can_login: z.boolean(),
});
export const profile = userChoice.omit({ can_login: true }).extend({
  team_id: optionalText,
  intern: z
    .object({
      day: z.number(),
      total_days: z.number(),
      stage,
      is_absent_today: z.boolean(),
      program_months: z.number().optional(),
    })
    .optional(),
  privacy: z
    .object({
      share_topics: z.boolean(),
      seen_privacy: z.boolean(),
      first_entry_text: text,
    })
    .optional(),
});
export const login = z.object({
  access_token: id,
  token_type: text,
  user: profile,
});
export const chat = z.object({
  id,
  title: text,
  task_id: optionalText,
  mode: replyMode,
  include_in_journal: z.boolean(),
  unresolved: z.boolean(),
  updated_at: date,
  created_at: date,
});
export const task = z.object({
  id,
  external_id: optionalText,
  title: text,
  description: optionalText,
  status: taskStatus,
  status_label: optionalText,
  deadline: optionalText,
  locked: z.boolean(),
});
export const taskDetail = task.extend({
  chats: chat.array(),
  can_create_chat: z.boolean(),
  notes: text.array(),
});
export const chatList = z.object({
  tasks: z.object({ task, chats: chat.array() }).array(),
  history: chat.array(),
  empty_tasks_text: text,
});
export const notification = z.object({
  id,
  kind: text,
  text,
  read: z.boolean().optional(),
  created_at: date,
  target: z
    .object({ route: text, id: optionalText, action_id: optionalText })
    .nullish(),
});
export const notifications = z.object({
  unread: z.number(),
  items: notification.array(),
});
export const nextStep = z.object({
  step_id: id,
  title: text,
  topic: optionalText,
  status: stepStatus.optional(),
  note: optionalText,
  unresolved_chat_id: optionalText,
});
export const home = z.object({
  stage,
  day: z.number(),
  total_days: z.number(),
  stages: stage
    .extend({
      state: z.enum(["done", "current", "next"]),
      progress: z.number().nullish(),
    })
    .array(),
  normalization_text: text,
  digest: z
    .object({ text, chat_id: id, chat_title: text, unresolved: z.boolean() })
    .nullish(),
  next_step: nextStep.nullish(),
  tasks_today: task
    .pick({ id: true, title: true, status: true, deadline: true })
    .array(),
  suggestions: text.array(),
  notifications: notification.array(),
  privacy_note: text,
});
export const step = z.object({
  id,
  title: text,
  topic: optionalText,
  has_practice: z.boolean(),
  status: stepStatus,
});
export const checklist = z.object({
  note: text,
  current_stage: id,
  stages: stage
    .extend({
      current: z.boolean(),
      done: z.number(),
      total: z.number(),
      steps: step.array(),
    })
    .array(),
});
export const practiceItem = z.object({
  id,
  task: text,
  criterion: text,
  status: practiceStatus,
  step_id: optionalText,
  topic: optionalText,
  message_id: optionalText,
  created_at: optionalText,
});
export const practice = z.object({
  step_id: id,
  topic: text,
  label: text,
  items: practiceItem.array(),
});
export const source = z.object({
  document_id: id,
  title: text,
  url: optionalText,
  system: text,
  updated_at: optionalText,
});
export const person = z.object({
  person_id: id,
  name: text,
  role: text,
  team: optionalText,
  handle: optionalText,
  reason: optionalText,
  how_to_ask: optionalText,
  questions: text.array().optional(),
  duration: optionalText,
  compact: z.boolean().optional(),
  note: optionalText,
  chain: z.object({ id, name: text, role: text }).array().nullish(),
  chain_label: optionalText,
});
export const field = z.object({
  key: id,
  label: text,
  type: text,
  options: z
    .array(z.union([text, z.object({ value: text, label: text.optional() })]))
    .nullish(),
  required: z.boolean().optional(),
});
export const payload = z.record(z.string(), z.unknown());
export const actionType = z.enum([
  "access_request",
  "absence_request",
  "doc_conflict_report",
]);
export const action = z.object({
  id,
  type: actionType,
  status: z.enum(["draft", "confirmed", "cancelled", "failed"]),
  external_id: optionalText,
  external_status: optionalText,
  payload,
  approver_id: optionalText,
  approver_name: optionalText,
  chat_id: optionalText,
  message_id: optionalText,
  timeline: z.object({ status: text, text, at: optionalText }).array(),
  checklist_prompt: z.object({ step_id: id, title: text }).nullish(),
  issue_id: optionalText,
  error: z.object({ code: text, message: text }).nullish(),
  created_at: optionalText,
  confirmed_at: optionalText,
});
export const actionDraft = z.object({
  action_id: id,
  type: actionType,
  payload,
  fields: field.array(),
  approver: z.object({ id, name: text, role: text }).nullish(),
  level_hint: optionalText,
  action: action.nullish(),
});
export const conflict = z.object({
  variants: z
    .object({
      document_id: id,
      source: text,
      url: optionalText,
      date: optionalText,
      team_version: z.boolean().optional(),
      steps: text.array(),
      summary: optionalText,
    })
    .array(),
  note: optionalText,
  action_id: id,
  draft_message: text,
  recipients: z.object({ id, name: text, role: text }).array(),
  action: action.nullish(),
});
export const notice = z.object({ kind: text.optional(), title: text, text });
export const guide = z.object({
  step: z.number(),
  total: z.number(),
  topic: optionalText,
});
export const attachment = z.object({
  id,
  kind: z.enum(["image", "log"]),
  filename: text,
  size: z.number().optional(),
  warning: optionalText,
});
export const message = z.object({
  id,
  chat_id: id,
  role: z.enum(["user", "assistant"]),
  content: text,
  route: optionalText,
  mode: replyMode.nullish(),
  sources: source.array().nullish(),
  blocks: object.array().nullish(),
  steps: text.array().nullish(),
  guide: guide.nullish(),
  attachments: attachment.array().nullish(),
  feedback: z.enum(["yes", "no"]).nullish(),
  created_at: date,
});
export const messages = z.object({
  chat,
  task: task.nullish(),
  messages: message.array(),
});
export const contact = z.object({
  id,
  person_id: optionalText,
  name: text,
  role: optionalText,
  team: optionalText,
  topics: text.array(),
  how_to_ask: optionalText,
  note: optionalText,
  source_chat_id: optionalText,
  source_chat_title: optionalText,
  created_at: date,
});
export const journalEntry = z.object({
  id,
  text,
  source_chat_id: optionalText,
  source_chat_title: optionalText,
  chat_deleted: z.boolean(),
  source_label: text,
  include_in_export: z.boolean(),
  shared_with_mentor: z.boolean(),
  created_at: date,
});
export const journal = z.object({ note: text, entries: journalEntry.array() });
export const suggestion = z.object({ text, chat_id: id, chat_title: text });
export const privacySettings = z.object({ share_topics: z.boolean() });
export const privacy = z.object({
  summary: text,
  columns: text.array(),
  matrix: z.record(z.string(), text).array(),
  flows: z.object({ title: text, text }).array(),
  ai_provider: z.object({
    mode: text,
    host: optionalText,
    model: optionalText,
    external: z.boolean(),
  }),
  settings: privacySettings,
  checklist_visible_to_mentor_by_default: z.boolean(),
  first_entry_text: text,
  access_log: z
    .object({
      viewer_id: optionalText,
      viewer_name: text,
      resource: text,
      decision: z.enum(["allow", "deny"]),
      reason: optionalText,
      created_at: date,
    })
    .array(),
});
export const mentor = z.object({
  note: text,
  interns: z
    .object({
      intern: z.object({
        id,
        name: text,
        team: optionalText,
        day: z.number(),
        total_days: z.number(),
        stage,
      }),
      is_absent_today: z.boolean(),
      checklist: z.object({
        done: z.number(),
        total: z.number(),
        current_stage: step
          .pick({ id: true, title: true, status: true })
          .array(),
      }),
      tasks: task.array(),
      access_requests: z
        .object({
          id,
          number: optionalText,
          project_key: optionalText,
          level: optionalText,
          status: text,
        })
        .array(),
      absences: z
        .object({
          id,
          number: optionalText,
          date_from: optionalText,
          status: text,
        })
        .array(),
      doc_issues: z
        .object({
          id,
          summary: text,
          document_ids: text.array(),
          status: text,
          created_at: date,
        })
        .array(),
      shared_journal: journalEntry
        .pick({ id: true, text: true, created_at: true })
        .array(),
      help_template: text,
      one_to_one_phrase: text,
      topic: optionalText,
      chats_access: text,
    })
    .array(),
});
export const streamSchemas = {
  status: z.object({ step: text, text }),
  token: z.object({ text }),
  source,
  person_card: person,
  action_draft: actionDraft,
  conflict,
  practice,
  next_step: nextStep,
  notice,
  error: z.object({
    code: text,
    message: text,
    fallback_person: z
      .object({ person_id: id, name: text, role: text })
      .nullish(),
  }),
  done: z.object({
    message_id: id,
    route: text,
    mode: replyMode,
    guide: guide.nullish(),
    replayed: z.boolean().optional(),
  }),
};
export type StreamEvent = {
  [Name in keyof typeof streamSchemas]: {
    name: Name;
    data: z.infer<(typeof streamSchemas)[Name]>;
  };
}[keyof typeof streamSchemas];
export type Profile = z.infer<typeof profile>;
export type Chat = z.infer<typeof chat>;
export type Task = z.infer<typeof task>;
export type Message = z.infer<typeof message>;
export type Person = z.infer<typeof person>;
export type Action = z.infer<typeof action>;
export type ActionDraft = z.infer<typeof actionDraft>;
export type ActionType = z.infer<typeof actionType>;
export type Field = z.infer<typeof field>;
export type Payload = z.infer<typeof payload>;
export type Contact = z.infer<typeof contact>;
export type JournalEntry = z.infer<typeof journalEntry>;
export type PracticeItem = z.infer<typeof practiceItem>;
export type ReplyMode = z.infer<typeof replyMode>;
export type StepStatus = z.infer<typeof stepStatus>;
export type TaskStatus = z.infer<typeof taskStatus>;
export type Notification = z.infer<typeof notification>;
