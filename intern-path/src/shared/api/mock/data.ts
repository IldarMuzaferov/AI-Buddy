import original from "./prototype-data.json";
import { z } from "zod";
import * as schema from "../contracts";

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export const intro =
  "Здесь можно задавать любые вопросы. Ваши чаты и вопросы видите только вы. Наставник видит прогресс чек-листа и статусы задач.";
export const labels = {
  new: "Новая",
  in_progress: "В работе",
  review: "На ревью",
  done: "Закрыта в трекере",
};
export const users = schema.userChoice.array().parse(
  Object.values(original.USERS).map((user) => ({
    ...user,
    title: { intern: "Стажёр", mentor: "Наставник", lead: "Лид" }[user.role],
    can_login: user.role !== "lead",
  })),
);
export const people = original.PEOPLE;
export const docs = Object.entries(original.DOCS).map(
  ([document_id, [title, system, updated_at]]) => ({
    document_id,
    title,
    system,
    updated_at,
    url: `https://${system.toLowerCase()}.example.com/${document_id}`,
  }),
);
export const stages = original.STAGES;
export const activeStage = (day: number) =>
  stages.find((stage) => stage.from <= day && stage.to >= day) ??
  stages[stages.length - 1];
export const stageNotes: Record<string, string> = original.NORM;
export const suggestions: Record<string, string[]> = original.SUGGEST;
export const help: Record<string, string> = original.HELP;
export const phrases: Record<string, string> = original.ONE2ONE;
const practiceCatalog: Record<string, { label: string; items: string[][] }> =
  original.PRACTICE;
const stepId = (id: string, topic?: string | null, stage?: string) =>
  topic === "access" && stage === "w24"
    ? "w24-access"
    : topic === "grafana" && stage === "w24"
      ? "w24-grafana"
      : id;
export const steps = original.STEPS.map((step) => ({
  ...step,
  id: stepId(step.id, step.topic, step.stage),
  seedId: step.id,
}));
export const askFor: Record<string, string> = {
  access: "Как запросить доступ к Jira-проекту PAY?",
  grafana: "Где смотреть логи и метрики Billing?",
  git: "Как создать dev-ветку?",
  stand: "Как получить доступ к тестовому стенду?",
};

export function practiceFor(stepId: string, topic: string) {
  const preset = practiceCatalog[topic] ?? practiceCatalog.git;
  return {
    step_id: stepId,
    topic,
    label: preset.label,
    items: preset.items.map(([task, criterion]) => ({
      id: uid(),
      step_id: stepId,
      topic,
      task,
      criterion,
      status: "open" as const,
      created_at: now(),
    })),
  };
}
export const nextStep = (data: InternData) => {
  const current = activeStage(data.day);
  const step = steps.find(
    (step) =>
      stages.findIndex((stage) => stage.id === step.stage) >=
        stages.indexOf(current) &&
      !["done", "hidden"].includes(data.steps[step.id]),
  );
  return step
    ? {
        step_id: step.id,
        title: step.title,
        topic: step.topic,
        status: data.steps[step.id],
        note: "Шаблон. В вашей команде может отличаться.",
      }
    : null;
};
export const fields: schema.Field[] = [
  { key: "project_key", label: "Проект", type: "text", required: true },
  {
    key: "level",
    label: "Уровень доступа",
    type: "enum",
    options: ["read", "write", "administration"],
    required: true,
  },
  {
    key: "justification",
    label: "Обоснование",
    type: "textarea",
    required: true,
  },
  { key: "space_or_page", label: "Пространство / страница", type: "text" },
  { key: "watch_issue_types", label: "Типы задач", type: "list" },
  { key: "cost_center", label: "Центр затрат", type: "text" },
];
export const defaults = {
  project_key: "PAY",
  level: "read",
  justification: "Для работы с задачами команды Payments.",
  space_or_page: "Payments / Платёжный модуль",
  watch_issue_types: ["Bug", "Story"],
  cost_center: "CC-PAY-01",
};
export const absenceFields: schema.Field[] = [
  { key: "date_from", label: "Начало", type: "date", required: true },
  { key: "date_to", label: "Окончание", type: "date", required: true },
  {
    key: "kind",
    label: "Тип",
    type: "enum",
    options: ["day_off", "vacation"],
    required: true,
  },
  { key: "reason", label: "Причина", type: "textarea", required: true },
];
export function personCard(
  personId: keyof typeof people,
  extra: Partial<schema.Person> = {},
): schema.Person {
  const person = people[personId];
  return {
    person_id: person.id,
    name: person.name,
    role: person.role,
    team: person.team,
    reason: person.reason,
    handle: `@${person.id}`,
    how_to_ask: `${person.first}, добрый день! Подскажите, пожалуйста, где найти инструкцию и что проверить в первую очередь?`,
    duration: "обычно 20 минут",
    ...extra,
  };
}
export function createAction(
  data: InternData,
  type: schema.ActionType,
  payload: schema.Payload,
  chat_id: string,
  message_id: string,
) {
  const action: schema.Action = {
    id: uid(),
    type,
    status: "draft",
    external_status: null,
    payload,
    chat_id,
    message_id,
    approver_id: "maria",
    approver_name: "Мария К., тимлид Payments",
    timeline: [{ status: "draft", text: "Черновик", at: now() }],
    created_at: now(),
  };
  data.actions.unshift(action);
  return action;
}
export function conflictCard(action: schema.Action) {
  return {
    action_id: action.id,
    draft_message: String(action.payload.text),
    note: "Сначала показываю версию команды.",
    variants: [
      {
        document_id: "stand-team",
        source: "Инструкция команды Payments",
        url: "https://confluence.example.com/stand-team",
        date: "2026-10-28",
        team_version: true,
        steps: [
          "Запросите доступ через заявку в PAY.",
          "Уточните стенд у DevOps.",
        ],
      },
      {
        document_id: "stand-general",
        source: "Общая инструкция",
        url: "https://confluence.example.com/stand-general",
        date: "2025-03-14",
        team_version: false,
        steps: ["Запросите доступ у администратора стенда."],
      },
    ],
    recipients: [
      { id: "oleg", name: "Олег Р.", role: "Владелец документа" },
      { id: "boris", name: "Борис Н.", role: "Наставник" },
    ],
  };
}
const snapshot = z.object({
  day: z.number(),
  absent: z.boolean(),
  acknowledged: z.boolean(),
  sharing: z.boolean(),
  chats: schema.chat.array(),
  tasks: schema.task.array(),
  messages: schema.message.array(),
  contacts: schema.contact.array(),
  entries: schema.journalEntry.array(),
  actions: schema.action.array(),
  notifications: schema.notification.array(),
  steps: z.record(z.string(), schema.stepStatus),
  practice: schema.practiceItem.array(),
  log: schema.privacy.shape.access_log,
  attachments: z.record(z.string(), schema.attachment.array()),
});
export type InternData = z.infer<typeof snapshot>;
const databaseSchema = z.object({
  anya: snapshot,
  dima: snapshot,
  failNext: z.boolean(),
});
export type Database = z.infer<typeof databaseSchema>;
export type InternId = "anya" | "dima";
export const isIntern = (id: string): id is InternId =>
  id === "anya" || id === "dima";

function seed(intern: InternId): InternData {
  const source = original.seed.data[intern];
  const data = snapshot.parse({
    day: source.day,
    absent: source.absentToday,
    acknowledged: false,
    sharing: false,
    chats: source.chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      task_id: chat.taskId,
      mode: "guide",
      include_in_journal: chat.includeInJournal,
      unresolved: chat.unresolved,
      created_at: chat.createdAt,
      updated_at: chat.updatedAt,
    })),
    tasks: source.tasks.map((task) => ({
      ...task,
      external_id: task.key,
      status_label: labels[task.status as schema.TaskStatus],
    })),
    messages: source.chats.flatMap((chat) =>
      chat.messages.map((message) => ({
        id: message.id,
        chat_id: chat.id,
        role: message.role === "ai" ? "assistant" : "user",
        content: message.text,
        created_at: message.at,
        steps: message.steps,
        guide:
          "guide" in message && message.guide
            ? { ...message.guide, topic: message.topic }
            : undefined,
        route: message.route,
        feedback: "feedback" in message ? message.feedback : undefined,
        sources: message.blocks?.flatMap((block) =>
          block.type === "sources"
            ? docs.filter((doc) => block.ids?.includes(doc.document_id))
            : [],
        ),
        blocks: message.blocks?.flatMap<schema.Payload>((block) => {
          if (
            block.type === "person" &&
            "pid" in block &&
            block.pid &&
            Object.hasOwn(people, block.pid)
          )
            return [
              {
                type: "person_card",
                ...personCard(block.pid as keyof typeof people, {
                  how_to_ask: block.ask,
                  reason: block.reason,
                  compact: block.compact,
                  questions: block.questions,
                }),
              },
            ];
          return [];
        }),
      })),
    ),
    contacts: source.contacts.map((contact) => ({
      ...contact,
      person_id: contact.pid,
      how_to_ask: contact.how,
      source_chat_id: contact.source,
      source_chat_title: source.chats.find((chat) => chat.id === contact.source)
        ?.title,
      created_at: contact.at,
    })),
    entries: source.journal.map((entry) => ({
      ...entry,
      source_chat_id: entry.chatId,
      source_chat_title: entry.chatTitle,
      chat_deleted: false,
      source_label: entry.chatTitle
        ? `Из чата «${entry.chatTitle}»`
        : "Добавлено вручную",
      include_in_export: entry.export,
      shared_with_mentor: false,
      created_at: entry.at,
    })),
    notifications: source.notifications.map((notification) => ({
      ...notification,
      created_at: notification.at,
    })),
    steps: Object.fromEntries(
      steps.map((step) => [
        step.id,
        source.steps[step.seedId as keyof typeof source.steps] ?? "todo",
      ]),
    ),
    practice: [],
    actions: [],
    attachments: {},
    log: source.accessLog.map((record) => ({
      viewer_name: record.who,
      resource: record.what,
      decision: "allow",
      created_at: record.at,
    })),
  });
  const conflictMessage = data.messages.find(
    (message) =>
      message.role === "assistant" &&
      data.chats.find((chat) => chat.id === message.chat_id)?.title ===
        "Доступ к тестовому стенду",
  );
  if (conflictMessage) {
    const action = createAction(
      data,
      "doc_conflict_report",
      {
        text: "Здравствуйте! В двух инструкциях по доступу к стенду указан разный порядок. Какой действует сейчас?",
      },
      conflictMessage.chat_id,
      conflictMessage.id,
    );
    conflictMessage.blocks = [
      ...(conflictMessage.blocks ?? []),
      { type: "conflict", ...conflictCard(action) },
    ];
  }
  return data;
}
const key = "intern-path-mock-v1";
export function fresh(): Database {
  return { anya: seed("anya"), dima: seed("dima"), failNext: false };
}
function load() {
  try {
    const parsed = databaseSchema.safeParse(
      JSON.parse(localStorage.getItem(key) ?? "null"),
    );
    if (parsed.success) return parsed.data;
  } catch {
    /* Storage can be disabled. */
  }
  return fresh();
}
export let database = load();
export function save() {
  try {
    localStorage.setItem(key, JSON.stringify(database));
  } catch {
    /* Memory remains available. */
  }
}
export function reset() {
  database = fresh();
  save();
}
export function profile(user: (typeof users)[number]): schema.Profile {
  const base = { ...user, team_id: "payments" };
  if (!isIntern(user.id)) return base;
  const data = database[user.id];
  return {
    ...base,
    intern: {
      day: data.day,
      total_days: 180,
      stage: activeStage(data.day),
      is_absent_today: data.absent,
      program_months: 6,
    },
    privacy: {
      share_topics: data.sharing,
      seen_privacy: data.acknowledged,
      first_entry_text: intro,
    },
  };
}
export function deleteChat(data: InternData, id: string) {
  data.chats = data.chats.filter((chat) => chat.id !== id);
  data.messages = data.messages.filter((message) => message.chat_id !== id);
  delete data.attachments[id];
  for (const entry of data.entries) {
    if (entry.source_chat_id === id) {
      entry.chat_deleted = true;
      entry.source_label = `Чат удалён · «${entry.source_chat_title}»`;
    }
  }
}
export function notify(
  data: InternData,
  kind: string,
  text: string,
  target: schema.Notification["target"],
) {
  data.notifications.unshift({
    id: uid(),
    kind,
    text,
    target,
    read: false,
    created_at: now(),
  });
}
