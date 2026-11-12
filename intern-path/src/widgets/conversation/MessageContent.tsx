import { useState } from "react";
import Markdown from "react-markdown";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import * as schema from "@/shared/api/contracts";
import { ActionCard } from "@/features/actions/ActionCard";
import { PracticeButton, PracticeCard } from "@/features/checklist/Practice";
import { useAssistant } from "@/features/assistant/useAssistant";
import {
  dateLabel,
  ErrorText,
  Glyph,
  Icon,
  safeLink,
} from "@/shared/ui/common";

export function Sources({
  items,
}: {
  items: NonNullable<schema.Message["sources"]>;
}) {
  return (
    <div className="sources">
      {items.map((source) => (
        <a
          key={source.document_id}
          className="src"
          href={safeLink(source.url)}
          target="_blank"
          rel="noreferrer"
        >
          <Glyph name="book" />
          <span>
            <strong>{source.title}</strong>
            <small>
              {source.system}
              {source.updated_at &&
                ` · обновлено ${dateLabel(source.updated_at)}`}
            </small>
          </span>
          <Icon name="external" />
        </a>
      ))}
    </div>
  );
}
function PersonCard({
  person,
  chatId,
}: {
  person: schema.Person;
  chatId: string;
}) {
  const api = useApi(),
    update = useUpdate(),
    contacts = useData(["contacts", ""], () => api.contacts.list()),
    [copied, setCopied] = useState(false);
  const saved = contacts.data?.some(
    (contact) => contact.person_id === person.person_id,
  );
  return (
    <section className="result-card person-card">
      <div className="result-kicker">
        <Glyph name="people" color="purple" />
        <div>
          <strong>
            {person.compact ? "Если не получится: " : ""}
            {person.name}
          </strong>
          <p>
            {person.role}
            {person.team && ` · ${person.team}`}
            {person.handle && ` · ${person.handle}`}
          </p>
        </div>
      </div>
      {person.reason && <p>{person.reason}</p>}
      {person.note && <p>{person.note}</p>}
      {person.how_to_ask && (
        <details>
          <summary>
            Как обратиться{person.duration && ` · ${person.duration}`}
          </summary>
          <p className="pre-line">{person.how_to_ask}</p>
          {person.questions?.length && (
            <ul>
              {person.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          )}
        </details>
      )}
      {person.chain?.length && (
        <details>
          <summary>{person.chain_label || "К кому ещё обратиться"}</summary>
          <ul>
            {person.chain.map((item) => (
              <li key={item.id}>
                {item.name} · {item.role}
              </li>
            ))}
          </ul>
        </details>
      )}
      <ErrorText error={update.error} />
      <div className="actions">
        <button
          className="btn small"
          disabled={Boolean(saved) || update.isPending}
          onClick={() =>
            update.mutate(() =>
              api.contacts.create({
                person_id: person.person_id,
                how_to_ask: person.how_to_ask ?? undefined,
                source_chat_id: chatId,
              }),
            )
          }
        >
          {saved ? "В знакомствах" : "Сохранить в знакомства"}
        </button>
        {person.how_to_ask && (
          <button
            className="btn small"
            onClick={() =>
              update.mutate(async () => {
                await navigator.clipboard.writeText(person.how_to_ask ?? "");
                setCopied(true);
              })
            }
          >
            <Icon name="copy" />
            {copied ? "Скопировано" : "Написать"}
          </button>
        )}
      </div>
    </section>
  );
}

export function Block({
  value,
  chatId,
}: {
  value: Record<string, unknown>;
  chatId: string;
}) {
  const assistant = useAssistant();
  const name = value.type ?? value.kind;
  const data =
    value.data && typeof value.data === "object"
      ? { ...value, ...value.data }
      : value;
  if (name === "person_card" || name === "person") {
    const parsed = schema.person.safeParse(data);
    if (parsed.success)
      return <PersonCard person={parsed.data} chatId={chatId} />;
  }
  if (name === "action_draft") {
    const parsed = schema.actionDraft.safeParse(data);
    if (parsed.success)
      return (
        <ActionCard actionId={parsed.data.action_id} draft={parsed.data} />
      );
    if (typeof data.action_id === "string")
      return <ActionCard actionId={data.action_id} />;
  }
  if (name === "conflict") {
    const parsed = schema.conflict.safeParse(data);
    if (parsed.success) {
      const conflict = parsed.data;
      return (
        <section className="result-card neutral">
          <div className="result-kicker">
            <Glyph name="alert" />
            <strong>В документах расхождение</strong>
          </div>
          <div className="variants">
            {[...conflict.variants]
              .sort(
                (a, b) =>
                  Number(Boolean(b.team_version)) -
                  Number(Boolean(a.team_version)),
              )
              .map((variant) => (
                <div className="panel" key={variant.document_id}>
                  <strong>{variant.source}</strong>
                  <p className="muted">{dateLabel(variant.date)}</p>
                  <p>{variant.summary}</p>
                  <ol>
                    {variant.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {variant.url && (
                    <a
                      href={safeLink(variant.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Открыть источник
                    </a>
                  )}
                </div>
              ))}
          </div>
          <p>{conflict.note}</p>
          <p>
            Получатели:{" "}
            {conflict.recipients.map((person) => person.name).join(", ")}
          </p>
          <ActionCard actionId={conflict.action_id} />
        </section>
      );
    }
  }
  if (name === "practice") {
    const parsed = schema.practice.safeParse(data);
    if (parsed.success)
      return (
        <PracticeCard label={parsed.data.label} items={parsed.data.items} />
      );
  }
  if (name === "next_step") {
    const parsed = schema.nextStep.safeParse(data);
    if (parsed.success) {
      const step = parsed.data;
      return (
        <section className="result-card neutral">
          <strong>{step.title}</strong>
          <p>{step.note}</p>
          <div className="actions">
            <button
              className="btn small"
              disabled={assistant.pending}
              onClick={() =>
                void assistant.send(
                  `Помоги с шагом «${step.title}»`,
                  "guide",
                  undefined,
                  chatId,
                )
              }
            >
              Спросить про шаг
            </button>
            <PracticeButton stepId={step.step_id} />
          </div>
        </section>
      );
    }
  }
  if (name === "notice") {
    const parsed = schema.notice.safeParse(data);
    if (parsed.success)
      return (
        <section className="result-card neutral">
          <strong>{parsed.data.title}</strong>
          <p>{parsed.data.text}</p>
        </section>
      );
  }
  if (name === "error") {
    const parsed = schema.streamSchemas.error.safeParse(data);
    if (parsed.success)
      return (
        <section className="result-card neutral">
          <p>{parsed.data.message}</p>
          {parsed.data.fallback_person && (
            <PersonCard person={parsed.data.fallback_person} chatId={chatId} />
          )}
        </section>
      );
  }
  return null;
}

export function MessageRow({
  message,
  locked,
}: {
  message: schema.Message;
  locked?: boolean;
}) {
  const api = useApi(),
    update = useUpdate(),
    assistant = useAssistant();
  if (message.role === "user")
    return (
      <div className="msg-user">
        {message.attachments?.map((file) => (
          <span className="file-chip" key={file.id}>
            <Icon name="clip" />
            {file.filename}
          </span>
        ))}
        {message.content && (
          <div className="bubble pre-line">{message.content}</div>
        )}
      </div>
    );
  return (
    <div className="msg-ai">
      <div className="ai-mark">
        <Icon name="spark" />
      </div>
      <div className="answer-body">
        {message.steps?.length && (
          <details className="answer-steps">
            <summary>Как искал ответ</summary>
            <ol>
              {message.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </details>
        )}
        {message.guide && (
          <div className="eyebrow">
            Подсказка {message.guide.step} из {message.guide.total}
          </div>
        )}
        <div className="answer-text">
          <Markdown>{message.content}</Markdown>
        </div>
        {!!message.sources?.length && <Sources items={message.sources} />}
        {message.blocks?.map((block, index) => (
          <Block key={index} value={block} chatId={message.chat_id} />
        ))}
        <ErrorText error={update.error} />
        <div className="actions feedback-actions">
          {message.guide && (
            <button
              className="btn small"
              disabled={locked || assistant.pending}
              onClick={() =>
                void assistant.followUp(message.chat_id, message.id, "direct")
              }
            >
              <Icon name="bolt" />
              Сразу ответ
            </button>
          )}
          {message.route === "error" && (
            <button
              className="btn small"
              disabled={locked || assistant.pending}
              onClick={() =>
                void assistant.followUp(message.chat_id, message.id, "retry")
              }
            >
              <Icon name="refresh" />
              Повторить
            </button>
          )}
          {message.route !== "error" && (
            <>
              <button
                className="btn small"
                aria-pressed={message.feedback === "yes"}
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(() => api.chats.feedback(message.id, true))
                }
              >
                <Icon name="thumbup" />
                Помогло
              </button>
              <button
                className="btn small"
                aria-pressed={message.feedback === "no"}
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(() => api.chats.feedback(message.id, false))
                }
              >
                <Icon name="thumbdown" />
                Не помогло
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
