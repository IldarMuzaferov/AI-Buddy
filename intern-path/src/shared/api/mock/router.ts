import { z } from "zod";
import * as schema from "../contracts";
import type { RequestOptions } from "../transport";
import { reply } from "./assistant";
import { records } from "./records";
import {
  activeStage,
  database,
  defaults,
  deleteChat,
  docs,
  fields,
  help,
  intro,
  isIntern,
  labels,
  nextStep,
  notify,
  now,
  phrases,
  practiceFor,
  profile,
  reset,
  save,
  stageNotes,
  stages,
  steps,
  suggestions,
  uid,
  users,
  type InternData,
} from "./data";
import {
  MockError,
  conflict,
  denied,
  empty,
  invalid,
  json,
  missing,
  object,
  parse,
  required,
  string,
} from "./http";

const taskInput = z.object({
  intern_id: string,
  title: string,
  description: z.string().optional(),
  deadline: z.string().optional(),
});
function newTask(body: unknown) {
  const fields = parse(taskInput, body);
  if (!isIntern(fields.intern_id)) throw missing();
  const data = database[fields.intern_id];
  const task: schema.Task = {
    id: uid(),
    external_id: `PAY-${230 + data.tasks.length}`,
    title: fields.title,
    description: fields.description ?? "",
    status: "new",
    status_label: labels.new,
    locked: false,
    deadline:
      fields.deadline ||
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  };
  data.tasks.unshift(task);
  notify(data, "task", `Наставник создал задачу «${task.title}»`, {
    route: "task",
    id: task.id,
  });
  return task;
}
function checklist(data: InternData) {
  const current = activeStage(data.day);
  return {
    note: "Шаблон. В вашей команде шаги могут отличаться.",
    current_stage: current.id,
    stages: stages.map((stage) => {
      const items = steps
        .filter((step) => step.stage === stage.id)
        .map((step) => ({
          ...step,
          status: data.steps[step.id],
          has_practice: Boolean(step.topic),
        }));
      return {
        ...stage,
        current: stage.id === current.id,
        done: items.filter((step) => step.status === "done").length,
        total: items.filter((step) => step.status !== "hidden").length,
        steps: items,
      };
    }),
  };
}
function findChat(data: InternData, id: string | undefined) {
  return required(data.chats.find((chat) => chat.id === id));
}
function findTask(data: InternData, id: string | undefined) {
  return required(data.tasks.find((task) => task.id === id));
}
function chatHistory(data: InternData, id: string | undefined) {
  const chat = findChat(data, id);
  return {
    chat,
    task: data.tasks.find((task) => task.id === chat.task_id) ?? null,
    messages: data.messages
      .filter((message) => message.chat_id === id)
      .map((message) => ({
        ...message,
        blocks: message.blocks?.map((block) => ({
          ...block,
          action: data.actions.find((action) => action.id === block.action_id),
        })),
      })),
  };
}
function taskView(data: InternData, id: string) {
  const task = findTask(data, id);
  return {
    ...task,
    chats: data.chats.filter((chat) => chat.task_id === task.id),
    can_create_chat: !task.locked,
    notes: task.locked ? ["Задача закрыта. Чаты доступны для чтения."] : [],
  };
}
function dev(path: string, body: unknown) {
  if (path === "/dev/reset") {
    reset();
    return json({ reset: true });
  }
  if (path === "/dev/sync") return json({ synced: true });
  if (path === "/dev/tracker/create-task") return json(newTask(body), 201);
  if (path === "/dev/llm/fail-next") {
    database.failNext = parse(z.object({ enabled: z.boolean() }), body).enabled;
    return json({ enabled: database.failNext });
  }
  if (path === "/dev/advance-day") {
    const { intern_id, days } = parse(
      z.object({ intern_id: string, days: z.number().int() }),
      body,
    );
    if (!isIntern(intern_id)) throw missing();
    const data = database[intern_id];
    data.day = Math.max(0, Math.min(180, data.day + days));
    return json({ day: data.day, stage: activeStage(data.day) });
  }
  if (path === "/dev/tracker/update-task") {
    const { task_id, status, description, deadline, shift_days } = parse(
      z.object({
        task_id: string,
        status: schema.taskStatus.optional(),
        description: z.string().optional(),
        deadline: z.iso.date().optional(),
        shift_days: z.number().int().optional(),
      }),
      body,
    );
    const task = required(
      [...database.anya.tasks, ...database.dima.tasks].find(
        (task) => task.id === task_id,
      ),
    );
    if (status) {
      task.status = status;
      task.locked = status === "done";
      task.status_label = labels[status];
    }
    if (description !== undefined) task.description = description;
    if (deadline) task.deadline = deadline;
    if (shift_days && task.deadline)
      task.deadline = new Date(
        Date.parse(task.deadline) + shift_days * 86400000,
      )
        .toISOString()
        .slice(0, 10);
    return json(task);
  }
  if (path === "/dev/access/approve" || path === "/dev/access/reject") {
    const { action_id, reason } = parse(
      z.object({ action_id: string, reason: z.string().optional() }),
      body,
    );
    const data = required(
      [database.anya, database.dima].find((data) =>
        data.actions.some((action) => action.id === action_id),
      ),
    );
    const action = required(
      data.actions.find((action) => action.id === action_id),
    );
    if (action.external_status !== "pending")
      throw conflict("Заявка не ждёт согласования.");
    const approved = path.endsWith("/approve");
    action.external_status = approved ? "granted" : "rejected";
    const text = approved ? "Доступ выдан" : reason || "Заявка отклонена";
    action.timeline.push({ status: action.external_status, text, at: now() });
    if (approved && action.type === "access_request")
      action.checklist_prompt = {
        step_id: "w24-access",
        title: "Запросить доступ к Jira-проекту PAY",
      };
    notify(data, "access", text, {
      route: "chat",
      id: action.chat_id,
      action_id: action.id,
    });
    return json(action);
  }
  throw missing();
}

async function route(url: URL, options: RequestOptions, token: string | null) {
  const { pathname: path, searchParams: search } = url;
  const [resource, id, operation] = path
    .split("/")
    .slice(1)
    .map(decodeURIComponent);
  const method = options.method ?? "GET",
    body = options.body;
  if (path === "/auth/users" && method === "GET") return json(users);
  if (path === "/auth/login" && method === "POST") {
    const { user_id } = parse(z.object({ user_id: string }), body);
    const user = required(users.find((user) => user.id === user_id));
    if (!user.can_login) throw denied();
    return json({
      access_token: `mock:${user.id}`,
      token_type: "bearer",
      user: profile(user),
    });
  }
  if (path === "/health")
    return json({
      status: "ok",
      db: "ok",
      mcp: "mock",
      llm_provider: "fake",
      dev_mode: true,
    });
  if (path === "/metrics")
    return new Response(
      "# TYPE intern_path_mock_up gauge\nintern_path_mock_up 1\n",
      { headers: { "Content-Type": "text/plain" } },
    );
  const user = users.find(
    (user) => token === `mock:${user.id}` && user.can_login,
  );
  if (!user) throw new MockError(401, "unauthorized", "Войдите в систему.");
  if (path === "/me") return json(profile(user));
  if (path === "/flags") return json({ guide_mode_default: "guide" });
  if (path === "/events" && method === "POST")
    return records(database.anya, resource, id, method, body, search);
  if (path === "/knowledge/search")
    return json(
      docs.filter((doc) =>
        doc.title.toLowerCase().includes((search.get("q") ?? "").toLowerCase()),
      ),
    );
  if (path === "/metrics/summary") {
    if (user.role === "intern") throw denied();
    const messages = [
      ...database.anya.messages,
      ...database.dima.messages,
    ].filter((message) => message.role === "assistant");
    return json({
      helpful: messages.filter((message) => message.feedback === "yes").length,
      not_helpful: messages.filter((message) => message.feedback === "no")
        .length,
      answers: messages.length,
    });
  }
  if (resource === "dev" && method === "POST") return dev(path, body);
  if (resource === "mentor") {
    if (user.role !== "mentor") throw denied();
    if (path === "/mentor/tasks" && method === "POST")
      return json(newTask(body), 201);
    if (path === "/mentor/interns" && method === "GET")
      return json({
        note: "Чаты, вопросы и знакомства стажёров недоступны наставнику.",
        interns: (["anya", "dima"] as const).map((id) => {
          const data = database[id],
            summary = checklist(data),
            stage = activeStage(data.day);
          const current = summary.stages.find((stage) => stage.current);
          const actions = data.actions.filter(
            (action) => action.status === "confirmed",
          );
          data.log.unshift({
            viewer_id: user.id,
            viewer_name: user.name,
            resource: "Прогресс чек-листа и статусы задач",
            decision: "allow",
            created_at: now(),
          });
          return {
            intern: {
              id,
              name: required(users.find((user) => user.id === id)).name,
              team: "Payments",
              day: data.day,
              total_days: 180,
              stage,
            },
            is_absent_today: data.absent,
            checklist: {
              done: summary.stages.reduce(
                (total, stage) => total + stage.done,
                0,
              ),
              total: summary.stages.reduce(
                (total, stage) => total + stage.total,
                0,
              ),
              current_stage: current?.steps ?? [],
            },
            tasks: data.tasks,
            access_requests: actions
              .filter((action) => action.type === "access_request")
              .map((action) => ({
                id: action.id,
                number: action.external_id,
                project_key: action.payload.project_key,
                level: action.payload.level,
                status: action.external_status ?? action.status,
              })),
            absences: actions
              .filter((action) => action.type === "absence_request")
              .map((action) => ({
                id: action.id,
                number: action.external_id,
                date_from: action.payload.date_from,
                status: action.external_status ?? action.status,
              })),
            doc_issues: actions
              .filter((action) => action.type === "doc_conflict_report")
              .map((action) => ({
                id: action.issue_id ?? action.id,
                summary: action.payload.text,
                document_ids: ["stand-team", "stand-general"],
                status: action.external_status ?? action.status,
                created_at: action.created_at,
              })),
            shared_journal: data.entries.filter(
              (entry) => entry.shared_with_mentor,
            ),
            help_template: help[stage.id] ?? help.w24,
            one_to_one_phrase: phrases[stage.id] ?? phrases.w24,
            topic: data.sharing
              ? (data.tasks.find((task) => task.status === "in_progress")
                  ?.title ?? "Онбординг")
              : undefined,
            chats_access: "denied",
          };
        }),
      });
  }
  if (resource === "notifications") {
    const items = isIntern(user.id) ? database[user.id].notifications : [];
    if (method === "GET")
      return json({ unread: items.filter((item) => !item.read).length, items });
    if (id === "read-all") {
      items.forEach((item) => {
        item.read = true;
      });
      return json({ unread: 0 });
    }
    if (operation === "read") {
      const item = required(items.find((item) => item.id === id));
      item.read = true;
      return json(item);
    }
  }
  if (!isIntern(user.id)) {
    const target = id && isIntern(id) ? id : "anya";
    database[target].log.unshift({
      viewer_id: user.id,
      viewer_name: user.name,
      resource: path,
      decision: "deny",
      reason: "Раздел доступен только стажёру.",
      created_at: now(),
    });
    save();
    throw denied();
  }
  const data = database[user.id];
  if (path === "/me/privacy-ack") {
    data.acknowledged = true;
    return json({ seen_privacy: true });
  }
  if (path === "/home") {
    const stage = activeStage(data.day),
      index = stages.indexOf(stage);
    const last = data.chats.find((chat) => chat.unresolved) ?? data.chats[0];
    return json({
      stage,
      day: data.day,
      total_days: 180,
      stages: stages.map((item, i) => ({
        ...item,
        state: i < index ? "done" : i === index ? "current" : "next",
        progress:
          i === index
            ? Math.min(
                1,
                (data.day - item.from + 1) / (item.to - item.from + 1),
              )
            : null,
      })),
      normalization_text: stageNotes[stage.id],
      digest: last
        ? {
            chat_id: last.id,
            chat_title: last.title,
            unresolved: last.unresolved,
            text: last.unresolved
              ? "Вы разбирались с этим вопросом. Ответ пока не помог."
              : "Вернитесь к последнему разговору.",
          }
        : null,
      next_step: nextStep(data),
      tasks_today: data.tasks.filter((task) => task.status === "in_progress"),
      suggestions: suggestions[stage.id] ?? suggestions.w24,
      notifications: data.notifications.filter((item) => !item.read),
      privacy_note: "Ваши чаты видите только вы",
    });
  }
  if (resource === "checklist") {
    if (!id) return json(checklist(data));
    const step = required(steps.find((step) => step.id === id));
    if (method === "PATCH") {
      const { status } = parse(z.object({ status: schema.stepStatus }), body);
      data.steps[id] = status;
      return json({ step_id: id, status });
    }
    if (operation === "practice" && method === "POST") {
      if (!step.topic)
        throw invalid("У этого шага нет практики.", "no_practice");
      const practice = practiceFor(id, step.topic);
      data.practice.unshift(...practice.items);
      return json(practice);
    }
  }
  if (resource === "practice") {
    if (method === "GET") return json(data.practice);
    const item = required(data.practice.find((item) => item.id === id));
    if (method === "PATCH") {
      Object.assign(
        item,
        parse(z.object({ status: schema.practiceStatus }), body),
      );
      return json(item);
    }
  }
  if (resource === "tasks") return json(id ? taskView(data, id) : data.tasks);
  if (resource === "chats") {
    if (!id && method === "GET") {
      const sorted = [...data.chats].sort((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      );
      return json({
        tasks: data.tasks.map((task) => ({
          task,
          chats: sorted.filter((chat) => chat.task_id === task.id),
        })),
        history: sorted.filter((chat) => !chat.task_id),
        empty_tasks_text:
          "Пока задач нет. Они появятся, когда наставник создаст задачу.",
      });
    }
    if (!id && method === "POST") {
      const { title, task_id } = parse(
        z.object({ title: string.optional(), task_id: string.optional() }),
        body,
      );
      if (task_id && findTask(data, task_id).locked)
        throw conflict("Задача закрыта в трекере.");
      const chat: schema.Chat = {
        id: uid(),
        title: title ?? "Новый чат",
        task_id,
        mode: "guide",
        include_in_journal: false,
        unresolved: false,
        created_at: now(),
        updated_at: now(),
      };
      data.chats.unshift(chat);
      return json(chat, 201);
    }
    const chat = findChat(data, id);
    if (!operation && method === "PATCH") {
      Object.assign(
        chat,
        parse(
          schema.chat
            .pick({ title: true, include_in_journal: true, mode: true })
            .partial(),
          body,
        ),
      );
      return json(chat);
    }
    if (!operation && method === "DELETE") {
      deleteChat(data, chat.id);
      return empty();
    }
    if (operation === "messages" && method === "GET")
      return json(chatHistory(data, chat.id));
    if (operation === "messages" && method === "POST") {
      const { text, mode, attachment_ids } = parse(
        z.object({
          text: z.string().max(4000),
          mode: schema.replyMode,
          attachment_ids: string.array(),
        }),
        body,
      );
      if (!text.trim() && !attachment_ids.length)
        throw invalid("Напишите вопрос или прикрепите файл.");
      return reply(data, chat, text, mode, {
        attachmentIds: attachment_ids,
        idempotencyKey: options.idempotencyKey,
        signal: options.signal,
      });
    }
    if (operation === "attachments" && method === "POST") {
      if (chat.task_id && findTask(data, chat.task_id).locked)
        throw conflict("Задача закрыта в трекере.");
      const file = body instanceof FormData ? body.get("file") : null;
      if (!(file instanceof File)) throw invalid("Выберите файл.");
      if (file.size > 5 * 1024 * 1024)
        throw new MockError(413, "too_large", "Размер файла превышает 5 МБ.");
      const kind = /\.(png|jpe?g|webp|gif)$/i.test(file.name)
        ? "image"
        : /\.(log|txt)$/i.test(file.name)
          ? "log"
          : null;
      if (!kind)
        throw new MockError(
          415,
          "unsupported_type",
          "Поддерживаются PNG, JPEG, WebP, GIF, LOG и TXT.",
        );
      const attachment: z.infer<typeof schema.attachment> = {
        id: uid(),
        filename: file.name,
        kind,
        size: file.size,
        warning: "Не отправляйте пароли и токены.",
      };
      (data.attachments[chat.id] ??= []).push(attachment);
      return json(attachment, 201);
    }
  }
  if (resource === "messages" && method === "POST") {
    const message = required(
      data.messages.find(
        (message) => message.id === id && message.role === "assistant",
      ),
    );
    const chat = findChat(data, message.chat_id);
    if (operation === "feedback") {
      const { helpful } = parse(z.object({ helpful: z.boolean() }), body);
      message.feedback = helpful ? "yes" : "no";
      if (
        data.messages
          .filter(
            (message) =>
              message.chat_id === chat.id && message.role === "assistant",
          )
          .at(-1)?.id === id
      )
        chat.unresolved = !helpful;
      return json({
        message_id: id,
        feedback: message.feedback,
        chat_unresolved: chat.unresolved,
      });
    }
    if (operation === "retry" || operation === "direct") {
      if (chat.task_id && findTask(data, chat.task_id).locked)
        throw conflict("Задача закрыта в трекере.");
      if (operation === "retry" && message.route !== "error")
        throw invalid("Повторить можно ответ с ошибкой.");
      if (operation === "direct" && !message.guide)
        throw invalid("У ответа нет подсказок.");
      const question = required(
        data.messages
          .slice(0, data.messages.indexOf(message))
          .findLast((item) => item.chat_id === chat.id && item.role === "user"),
      );
      if (operation === "retry")
        data.messages = data.messages.filter((item) => item.id !== id);
      return reply(
        data,
        chat,
        question.content,
        operation === "direct" ? "direct" : (message.mode ?? chat.mode),
        { silent: true, signal: options.signal },
      );
    }
  }
  if (path === "/access/presets")
    return json({
      team: "Payments",
      fields,
      defaults,
      levels: ["read", "write", "administration"],
    });
  if (resource === "actions" && id) {
    const action = required(data.actions.find((action) => action.id === id));
    if (method === "GET" && operation === "reminder") {
      if (action.external_status !== "pending")
        throw conflict("Заявка не ждёт согласования.");
      return json({
        text: `Добрый день! Подскажите, пожалуйста, статус заявки ${action.external_id}.`,
        channel: "Mattermost",
        sent: false,
      });
    }
    if (method === "PATCH") {
      if (action.status !== "draft")
        throw conflict("Изменить можно только черновик.");
      action.payload = { ...action.payload, ...parse(object, body) };
      return json(action);
    }
    if (method === "POST" && operation === "cancel") {
      if (action.status !== "draft")
        throw conflict("Отменить можно только черновик.");
      action.status = "cancelled";
      action.timeline.push({
        status: "cancelled",
        text: "Отменено. Ничего не отправлено.",
        at: now(),
      });
      return json(action);
    }
    if (method === "POST" && operation === "confirm") {
      if (action.status === "confirmed") return json(action);
      if (action.status !== "draft")
        throw conflict("Подтвердить можно только черновик.");
      if (/глобальн|global/i.test(String(action.payload.space_or_page ?? ""))) {
        action.status = "failed";
        action.error = {
          code: "forbidden",
          message: "Доступ к глобальному пространству запрещён.",
        };
        save();
        throw denied();
      }
      if (action.type === "absence_request") {
        const absence = parse(
          z.object({
            date_from: z.iso.date(),
            date_to: z.iso.date(),
            kind: string,
            reason: string,
          }),
          action.payload,
        );
        if (absence.date_to < absence.date_from)
          throw invalid("Дата окончания должна быть не раньше даты начала.");
      }
      if (action.type === "access_request")
        parse(
          z.object({
            project_key: string,
            level: z.enum(["read", "write", "administration"]),
            justification: string,
          }),
          action.payload,
        );
      if (action.type === "doc_conflict_report")
        parse(z.object({ text: string }), action.payload);
      action.status = "confirmed";
      action.confirmed_at = now();
      action.external_id = `${action.type === "doc_conflict_report" ? "DOC" : action.type === "absence_request" ? "ABS" : "ACC"}-${1042 + data.actions.indexOf(action)}`;
      action.external_status =
        action.type === "doc_conflict_report" ? "sent" : "pending";
      if (action.type === "doc_conflict_report")
        action.issue_id = action.external_id;
      action.timeline.push(
        { status: "confirmed", text: "Подтверждено вами", at: now() },
        {
          status: "sent",
          text: `Отправлено (${action.external_id})`,
          at: now(),
        },
      );
      if (action.external_status === "pending")
        action.timeline.push({
          status: "pending",
          text: `Ждёт согласования у ${action.approver_name}`,
          at: now(),
        });
      return json(action);
    }
  }
  if (resource === "privacy") {
    if (method === "PUT" && id === "settings") {
      data.sharing = parse(schema.privacySettings, body).share_topics;
      return json({ share_topics: data.sharing });
    }
    if (method === "DELETE" && id === "chats") {
      const ids = data.chats.map((chat) => chat.id);
      ids.forEach((id) => deleteChat(data, id));
      return json({
        deleted: ids.length,
        kept: "Записи журнала и знакомства остались",
      });
    }
    if (method === "GET" && !id)
      return json({
        summary: intro,
        columns: ["intern", "mentor", "lead", "hr", "ai_provider"],
        matrix: [
          {
            data: "Чаты и вопросы",
            intern: "yes",
            mentor: "no",
            lead: "no",
            hr: "no",
            ai_provider: "Текст запроса для ответа",
          },
          {
            data: "Прогресс чек-листа",
            intern: "yes",
            mentor: "yes",
            lead: "yes",
            hr: "no",
            ai_provider: "no",
          },
          {
            data: "Знакомства",
            intern: "yes",
            mentor: "no",
            lead: "no",
            hr: "no",
            ai_provider: "no",
          },
          {
            data: "Тема задачи",
            intern: "yes",
            mentor: data.sharing ? "yes" : "no",
            lead: "no",
            hr: "no",
            ai_provider: "no",
          },
        ],
        flows: [
          {
            title: "Вы задаёте вопрос",
            text: "Запрос обрабатывает имитация ассистента.",
          },
          {
            title: "Вы подтверждаете заявку",
            text: "Согласующему передаётся только черновик заявки.",
          },
        ],
        ai_provider: {
          mode: "fake",
          host: null,
          model: "demo",
          external: false,
        },
        settings: { share_topics: data.sharing },
        checklist_visible_to_mentor_by_default: true,
        first_entry_text: intro,
        access_log: data.log,
      });
  }
  return (
    (await records(data, resource, id, method, body, search)) ??
    (() => {
      throw missing();
    })()
  );
}
export async function mockRequest(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  options.signal?.throwIfAborted();
  try {
    const response = await route(
      new URL(path, "http://mock.local"),
      options,
      token,
    );
    if (
      (options.method && options.method !== "GET") ||
      path === "/mentor/interns"
    )
      save();
    return (
      response ??
      json({ error: { code: "not_found", message: "Маршрут не найден." } }, 404)
    );
  } catch (error) {
    if (error instanceof MockError)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    console.error("Mock API:", error);
    return json(
      { error: { code: "mock_error", message: "Ошибка мок-сервера." } },
      500,
    );
  }
}
