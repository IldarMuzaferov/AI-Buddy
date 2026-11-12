import { useRef, useState } from "react";
import { useApi, useData } from "@/entities/session/api/client";
import type { ReplyMode } from "@/shared/api/contracts";
import { ErrorText, Icon } from "@/shared/ui/common";
import { useAssistant, useStream } from "./useAssistant";

export function Composer({
  chatId,
  locked,
  initialMode,
  home = false,
}: {
  chatId?: string;
  locked?: boolean;
  initialMode?: ReplyMode;
  home?: boolean;
}) {
  const [text, setText] = useState(""),
    [file, setFile] = useState<File>(),
    [fileError, setFileError] = useState<string>();
  const [mode, setMode] = useState<ReplyMode>();
  const api = useApi(),
    flags = useData(["flags"], api.system.flags);
  const input = useRef<HTMLInputElement>(null);
  const assistant = useAssistant(),
    stream = useStream();
  const effectiveMode =
    mode ?? initialMode ?? flags.data?.guide_mode_default ?? "guide";
  function submit() {
    if (locked || assistant.pending || (!text.trim() && !file)) return;
    void assistant
      .send(text.trim(), effectiveMode, file, chatId)
      .then((sent) => {
        if (sent) {
          setText("");
          setFile(undefined);
        }
      });
  }
  if (locked)
    return (
      <p className="norm">
        <Icon name="lock" /> Задача закрыта в трекере. Чат доступен для чтения.
      </p>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="question-box">
        <button
          type="button"
          className="icon-button"
          aria-label="Прикрепить изображение или лог"
          disabled={assistant.pending}
          onClick={() => input.current?.click()}
        >
          <Icon name="clip" />
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.gif,.log,.txt"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (!selected) return;
            if (selected.size > 5 * 1024 * 1024) {
              setFileError("Размер файла превышает 5 МБ.");
              return;
            }
            if (!/\.(png|jpe?g|webp|gif|log|txt)$/i.test(selected.name)) {
              setFileError("Поддерживаются PNG, JPEG, WebP, GIF, LOG и TXT.");
              return;
            }
            setFileError(undefined);
            setFile(selected);
          }}
        />
        <textarea
          aria-label="Ваш вопрос"
          rows={1}
          maxLength={4000}
          placeholder={
            home
              ? "Спросите, где что лежит, кто отвечает или как здесь принято"
              : "Напишите вопрос…"
          }
          value={text}
          disabled={assistant.pending}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          className="btn primary send"
          aria-label="Отправить вопрос"
          disabled={assistant.pending || (!text.trim() && !file)}
        >
          <Icon name="up" />
        </button>
      </div>
      {fileError && (
        <p role="alert" className="inline-error">
          {fileError}
        </p>
      )}
      {file && (
        <div className="attach-chip">
          <Icon name="clip" />
          <strong>{file.name}</strong>
          <span>Не отправляйте пароли и токены.</span>
          <button
            type="button"
            className="text-button"
            onClick={() => setFile(undefined)}
          >
            Убрать
          </button>
        </div>
      )}
      <div className="composer-meta">
        <div className="segmented" role="group" aria-label="Режим ответа">
          <button
            type="button"
            aria-pressed={effectiveMode === "guide"}
            onClick={() => setMode("guide")}
          >
            <Icon name="compass" />
            Навести
          </button>
          <button
            type="button"
            aria-pressed={effectiveMode === "direct"}
            onClick={() => setMode("direct")}
          >
            <Icon name="bolt" />
            Сразу ответ
          </button>
        </div>
        <span className="privacy-caption">
          <Icon name="shield" /> Ваши чаты видите только вы
        </span>
      </div>
      {home && stream.chatId === null && (
        <>
          <ErrorText error={stream.error} />
          {stream.retry && (
            <button
              type="button"
              className="btn small"
              onClick={() => void stream.retry?.()}
            >
              Повторить отправку
            </button>
          )}
        </>
      )}
    </form>
  );
}
