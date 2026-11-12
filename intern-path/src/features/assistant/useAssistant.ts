import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { useSession } from "@/entities/session/store";
import { useApi } from "@/entities/session/api/client";
import type { ReplyMode, StreamEvent } from "@/shared/api/contracts";
import { useNavigation } from "@/shared/ui/navigation";

interface StreamState {
  chatId: string | null;
  pending: boolean;
  question: string;
  filename?: string;
  events: StreamEvent[];
  error: unknown;
  controller?: AbortController;
  retry?: () => Promise<void>;
}
const initial: StreamState = {
  chatId: null,
  pending: false,
  question: "",
  events: [],
  error: null,
};
export const useStream = create<StreamState>(() => initial);
export function clearAssistant() {
  useStream.getState().controller?.abort();
  useStream.setState({
    ...initial,
    filename: undefined,
    controller: undefined,
    retry: undefined,
  });
}

export function useAssistant() {
  const api = useApi(),
    cache = useQueryClient();
  const { backend, token } = useSession();
  const go = useNavigation((state) => state.go);
  const pending = useStream((state) => state.pending);

  async function run(
    operation: (
      controller: AbortController,
      onEvent: (event: StreamEvent) => void,
    ) => Promise<void>,
    values: Partial<StreamState> = {},
  ): Promise<boolean> {
    if (useStream.getState().pending) return false;
    const controller = new AbortController();
    const scope = [backend, token];
    const isCurrent = () =>
      !controller.signal.aborted &&
      useStream.getState().controller === controller &&
      useSession.getState().token === token &&
      useSession.getState().backend === backend;
    useStream.setState({
      ...initial,
      filename: undefined,
      ...values,
      controller,
      pending: true,
      retry: undefined,
    });
    try {
      await operation(controller, (event) => {
        if (isCurrent())
          useStream.setState((state) => ({ events: [...state.events, event] }));
      });
      return true;
    } catch (error) {
      if (isCurrent())
        useStream.setState({
          error,
          retry: async () => {
            await run(operation, {
              ...values,
              chatId: useStream.getState().chatId,
            });
          },
        });
      return false;
    } finally {
      if (isCurrent()) {
        await cache.invalidateQueries({ queryKey: scope });
        if (isCurrent())
          useStream.setState({ pending: false, events: [], question: "" });
      }
    }
  }

  return {
    pending,
    send(
      question: string,
      mode: ReplyMode,
      file?: File,
      chatId?: string,
      taskId?: string,
    ) {
      const key = crypto.randomUUID();
      let targetId = chatId,
        attachmentIds: string[] = [];
      return run(
        async (controller, onEvent) => {
          if (!targetId) {
            const chat = await api.chats.create({ task_id: taskId });
            controller.signal.throwIfAborted();
            targetId = chat.id;
          }
          useStream.setState({ chatId: targetId });
          go({ page: "chat", id: targetId });
          if (file && !attachmentIds.length) {
            const attachment = await api.chats.attach(
              targetId,
              file,
              controller.signal,
            );
            attachmentIds = [attachment.id];
          }
          await api.chats.send(
            targetId,
            { text: question, mode, attachment_ids: attachmentIds },
            key,
            onEvent,
            controller.signal,
          );
        },
        { chatId: chatId ?? null, question, filename: file?.name },
      );
    },
    followUp(chatId: string, messageId: string, kind: "direct" | "retry") {
      return run(
        (controller, onEvent) =>
          api.chats.followUp(messageId, kind, onEvent, controller.signal),
        { chatId },
      );
    },
  };
}
