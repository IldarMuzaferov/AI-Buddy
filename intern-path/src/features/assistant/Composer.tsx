import { useState } from 'react';
import { useApi, useData } from '@/entities/session/api/client';
import type { ReplyMode } from '@/shared/api/contracts';
import { ErrorText, Icon } from '@/shared/ui/common';
import { useAssistant, useStream } from './useAssistant';

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
  const [text, setText] = useState('');
  const api = useApi(),
    flags = useData(['flags'], api.system.flags);
  const assistant = useAssistant(),
    stream = useStream();
  const directPrefix = /^(сразу ответ|ответь сразу|дай готовый ответ)\s*:/i;
  const helperPrefix = /^(помоги|объясни|подскажи|научи|покажи|наведи)\s*:/i;
  const effectiveMode: ReplyMode = directPrefix.test(text.trim())
    ? 'direct'
    : helperPrefix.test(text.trim()) ? 'guide' : initialMode ?? flags.data?.guide_mode_default ?? 'guide';
  function submit() {
    if (locked || assistant.pending || !text.trim()) return;
    const question = text.trim().replace(/^(сразу ответ|ответь сразу|дай готовый ответ|помоги|объясни|подскажи|научи|покажи|наведи)\s*:\s*/i, '');
    void assistant.send(question, effectiveMode, undefined, chatId).then((sent) => {
      if (sent) setText('');
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
        <textarea
          aria-label="Ваш вопрос"
          rows={1}
          maxLength={4000}
          placeholder={
            home
              ? 'Спросите, где что лежит, кто отвечает или как здесь принято'
              : 'Напишите вопрос…'
          }
          value={text}
          disabled={assistant.pending}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          className="btn primary send"
          aria-label="Отправить вопрос"
          disabled={assistant.pending || !text.trim()}
        >
          <Icon name="up" />
        </button>
      </div>
      <div className="composer-meta">
        <span className="privacy-caption">
          <Icon name="shield" /> Ваши чаты видите только вы
        </span>
      </div>
      {home && stream.chatId === null && (
        <>
          <ErrorText error={stream.error} />
          {stream.retry && (
            <button type="button" className="btn small" onClick={() => void stream.retry?.()}>
              Повторить отправку
            </button>
          )}
        </>
      )}
    </form>
  );
}
