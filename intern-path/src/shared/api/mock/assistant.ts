import type { Chat, Message, ReplyMode, StreamEvent } from "../contracts";
import {
  activeStage,
  absenceFields,
  conflictCard,
  createAction,
  database,
  defaults,
  docs,
  fields,
  nextStep,
  now,
  personCard,
  practiceFor,
  save,
  steps,
  uid,
  type InternData,
} from "./data";
import { MockError, conflict, invalid } from "./http";

const replays = new Map<string, StreamEvent[]>();
const sendsByIntern = new WeakMap<InternData, number[]>();
const encoder = new TextEncoder();

function responseStream(events: StreamEvent[], signal?: AbortSignal) {
  let index = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (index === events.length) {
          controller.close();
          return;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, events[index].name === "token" ? 25 : 90),
        );
        if (signal?.aborted) {
          controller.error(signal.reason);
          return;
        }
        const { name, data } = events[index++];
        controller.enqueue(
          encoder.encode(
            `event: ${name}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`,
          ),
        );
      },
    }),
    { headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );
}

export function reply(
  data: InternData,
  chat: Chat,
  question: string,
  mode: ReplyMode,
  options: {
    silent?: boolean;
    attachmentIds?: string[];
    idempotencyKey?: string;
    signal?: AbortSignal;
  } = {},
) {
  const replayKey = options.idempotencyKey
    ? `${chat.id}:${options.idempotencyKey}`
    : null;
  const replay = replayKey ? replays.get(replayKey) : undefined;
  if (replay)
    return responseStream(
      replay.map((event) =>
        event.name === "done"
          ? { ...event, data: { ...event.data, replayed: true } }
          : event,
      ),
      options.signal,
    );
  if (data.tasks.some((task) => task.id === chat.task_id && task.locked))
    throw conflict("Задача закрыта в трекере.");
  const text = question.toLowerCase();
  const messageId = uid();
  const blocks: NonNullable<Message["blocks"]> = [];
  const extras: StreamEvent[] = [];
  const sources: NonNullable<Message["sources"]> = [];
  let guide: Message["guide"] = null;
  let route = "lookup";
  let content = "";
  const status = ["Ищу в вики", "Проверяю материалы команды", "Формирую ответ"];
  function addSource(...ids: string[]) {
    sources.push(...docs.filter((doc) => ids.includes(doc.document_id)));
  }
  function addBlock(
    event: Exclude<
      StreamEvent,
      { name: "status" | "token" | "source" | "done" }
    >,
  ) {
    extras.push(event);
    blocks.push({ type: event.name, ...event.data });
  }
  if (!options.silent) {
    const attachments = (options.attachmentIds ?? []).map((id) => {
      const attachment = data.attachments[chat.id]?.find(
        (item) => item.id === id,
      );
      if (!attachment) throw invalid("Вложение не найдено.");
      return attachment;
    });
    const timestamp = Date.now();
    const recent = (sendsByIntern.get(data) ?? []).filter(
      (sentAt) => timestamp - sentAt < 60_000,
    );
    if (recent.length >= 20)
      throw new MockError(
        429,
        "rate_limited",
        "Можно отправить до 20 сообщений в минуту.",
      );
    sendsByIntern.set(data, [...recent, timestamp]);
    data.messages.push({
      id: uid(),
      chat_id: chat.id,
      role: "user",
      content: question,
      attachments,
      created_at: now(),
    });
    if (chat.title === "Новый чат")
      chat.title = question.slice(0, 70) || "Вложение";
  }
  if (database.failNext) {
    database.failNext = false;
    route = "error";
    content = "Не получилось ответить. Вот человек, которого можно спросить.";
    addBlock({
      name: "error",
      data: {
        code: "llm_timeout",
        message: content,
        fallback_person: personCard("boris"),
      },
    });
  } else if (/глобальн/.test(text)) {
    route = "out_of_scope";
    content =
      "Запросите доступ к конкретной странице или пространству команды.";
    addBlock({
      name: "notice",
      data: {
        kind: "policy",
        title: "Глобальное пространство",
        text: "Доступ к глобальному пространству через помощника не оформляется.",
      },
    });
  } else if (/доступ/.test(text) && /jira|джир|pay|проект/.test(text)) {
    route = "access_request";
    content = "Собрал черновик по шаблону команды Payments.";
    const action = createAction(
      data,
      "access_request",
      defaults,
      chat.id,
      messageId,
    );
    addBlock({
      name: "action_draft",
      data: {
        action_id: action.id,
        type: "access_request",
        payload: action.payload,
        fields,
        approver: { id: "maria", name: "Мария К.", role: "Тимлид Payments" },
        level_hint: "Для чтения задач достаточно уровня read.",
      },
    });
  } else if (/отгул|отпуск|выходн/.test(text)) {
    route = "absence_request";
    content =
      "Согласуйте даты с руководителем, затем проверьте черновик отсутствия.";
    addSource("absence");
    const action = createAction(
      data,
      "absence_request",
      { date_from: "", date_to: "", kind: "day_off", reason: "" },
      chat.id,
      messageId,
    );
    addBlock({
      name: "action_draft",
      data: {
        action_id: action.id,
        type: "absence_request",
        payload: action.payload,
        fields: absenceFields,
        approver: { id: "maria", name: "Мария К.", role: "Тимлид Payments" },
      },
    });
  } else if (/практик|потренир/.test(text)) {
    route = "practice";
    content = "Вот микро-задания для самостоятельной практики.";
    const topic = /grafana|графан|логи/.test(text)
      ? "grafana"
      : /стенд/.test(text)
        ? "stand"
        : "git";
    const pack = practiceFor(
      steps.find((step) => step.topic === topic)?.id ?? topic,
      topic,
    );
    data.practice.unshift(...pack.items);
    addBlock({ name: "practice", data: pack });
  } else if (/стенд/.test(text)) {
    content =
      "В документах расходится порядок получения доступа к тестовому стенду.";
    const action = createAction(
      data,
      "doc_conflict_report",
      {
        text: "Здравствуйте! В двух инструкциях по доступу к стенду указан разный порядок. Какой действует сейчас?",
      },
      chat.id,
      messageId,
    );
    addBlock({ name: "conflict", data: conflictCard(action) });
  } else if (/кто|владелец/.test(text) && /плат|billing/.test(text)) {
    content =
      "За сервис платежей (Billing) отвечает **Игорь Л.** — он указан владельцем `/services/billing/` в CODEOWNERS.";
    addSource("codeowners", "billing");
    addBlock({
      name: "person_card",
      data: personCard("igor", {
        questions: [
          "Где посмотреть устройство платёжного модуля?",
          "Кто проверяет изменения Billing?",
        ],
      }),
    });
  } else if (/дальше|следующ/.test(text)) {
    route = "process";
    const step = nextStep(data);
    content = step
      ? `Сейчас у вас этап «${activeStage(data.day).label}». Вот ближайший шаг чек-листа.`
      : "Все шаги чек-листа отмечены.";
    if (step) addBlock({ name: "next_step", data: step });
  } else if (
    /ветк|git|ревью|pipeline|пайплайн|сделай за меня/.test(text) ||
    data.messages.findLast(
      (item) => item.chat_id === chat.id && item.role === "assistant",
    )?.guide
  ) {
    route = "howto";
    const last = data.messages.findLast(
      (item) => item.chat_id === chat.id && item.role === "assistant",
    );
    const topic = /ревью/.test(text)
      ? "review"
      : /pipeline|пайплайн/.test(text)
        ? "ci"
        : /ветк|git/.test(text)
          ? "git"
          : (last?.guide?.topic ?? "git");
    const review = topic === "review",
      ci = topic === "ci";
    const step = last?.guide?.topic === topic ? last.guide.step + 1 : 1;
    addSource(review ? "review" : ci ? "cicd" : "gitpr");
    if (mode === "guide" && step <= 2) {
      guide = { topic, step, total: 2 };
      content =
        step === 1
          ? review
            ? "**Вопрос:** в какой папке лежат изменения? Проверьте владельца в CODEOWNERS."
            : ci
              ? "**Вопрос:** какой шаг упал первым — сборка, линтер или тесты?"
              : "**Вопрос:** какой ключ у вашей задачи в трекере? Он понадобится в имени ветки."
          : "Откройте инструкцию из источника и сверьте с ней ваш следующий шаг.";
    } else {
      content = review
        ? "Откройте pull request в `dev`. Ревьюеры назначаются по CODEOWNERS."
        : ci
          ? "1. Найдите первую ошибку в логе.\n2. Повторите шаг локально.\n3. Исправьте ошибку и отправьте коммит."
          : "1. `git checkout dev && git pull`\n2. `git checkout -b feature/PAY-214-short-name`\n3. После коммита отправьте ветку через `git push -u origin`.";
    }
  } else if (/grafana|графан|логи|метрик/.test(text)) {
    content =
      "Метрики и логи Billing — в Grafana, дашборды «Billing / Overview» и «Billing / Logs».";
    addSource("grafana");
    addBlock({
      name: "person_card",
      data: personCard("oleg", { compact: true }),
    });
  } else if (/код|конфиг|собрать|репозитор/.test(text)) {
    content =
      "Код сервиса — в Bitbucket, репозиторий `billing-service`. Конфигурация лежит в папке `/config`.";
    addSource("billing", "build");
  } else if (/тяжело|устал|страшно|не справля/.test(text)) {
    route = "emotional";
    content =
      "В первые недели многое может быть непонятно. Возьмите один конкретный вопрос на ближайшую встречу с наставником.";
    addBlock({ name: "person_card", data: personCard("boris") });
  } else {
    route = "no_answer";
    content =
      "В доступных мне материалах этого нет. Вот человек, который может подсказать.";
    addBlock({ name: "person_card", data: personCard("boris") });
  }
  chat.updated_at = now();
  chat.mode = mode;
  data.messages.push({
    id: messageId,
    chat_id: chat.id,
    role: "assistant",
    route,
    mode,
    content,
    steps: status,
    guide,
    sources,
    blocks,
    feedback: null,
    created_at: now(),
  });
  save();
  const events: StreamEvent[] = [
    ...status.map((text, index) => ({
      name: "status" as const,
      data: { step: String(index), text },
    })),
    ...(content.match(/[\s\S]{1,30}/g) ?? []).map((text) => ({
      name: "token" as const,
      data: { text },
    })),
    ...sources.map((data) => ({ name: "source" as const, data })),
    ...extras,
    { name: "done", data: { message_id: messageId, mode, route, guide } },
  ];
  if (replayKey) {
    if (replays.size >= 100) replays.delete(replays.keys().next().value ?? "");
    replays.set(replayKey, events);
  }
  return responseStream(events, options.signal);
}
