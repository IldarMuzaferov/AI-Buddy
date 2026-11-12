import { z } from "zod";
import { streamSchemas, type StreamEvent } from "./contracts";

export type RequestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export interface RequestOptions {
  method?: RequestMethod;
  body?: unknown;
  signal?: AbortSignal;
  idempotencyKey?: string;
}
export interface ApiContext {
  backend: "mock" | "server";
  token: string | null;
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export function createTransport(context: ApiContext) {
  async function request(path: string, options: RequestOptions = {}) {
    const headers = new Headers();
    if (context.token) headers.set("Authorization", `Bearer ${context.token}`);
    if (options.idempotencyKey)
      headers.set("Idempotency-Key", options.idempotencyKey);
    const form = options.body instanceof FormData;
    if (options.body !== undefined && !form)
      headers.set("Content-Type", "application/json");
    const url =
      (import.meta.env?.VITE_API_BASE_URL || "/api").replace(/\/$/, "") + path;
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
      signal: options.signal,
      body: form ? (options.body as FormData) : JSON.stringify(options.body),
    };
    let response: Response;
    try {
      if (context.backend === "mock") {
        const { mockRequest } = await import("./mock/router");
        response = await mockRequest(path, options, context.token);
      } else {
        response = await fetch(url, init);
      }
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        0,
        "network",
        "Не удалось связаться с API. Проверьте соединение и попробуйте снова.",
      );
    }
    if (!response.ok) {
      const parsed = errorSchema.safeParse(
        await response.json().catch(() => null),
      );
      throw new ApiError(
        response.status,
        parsed.data?.error.code ?? "http_error",
        parsed.data?.error.message ?? `Ошибка API (${response.status})`,
      );
    }
    return response;
  }
  return {
    async json<Schema extends z.ZodType>(
      path: string,
      schema: Schema,
      options?: RequestOptions,
    ): Promise<z.output<Schema>> {
      const response = await request(path, options);
      const data: unknown =
        response.status === 204
          ? undefined
          : await response.json().catch(() => undefined);
      const parsed = schema.safeParse(data);
      if (!parsed.success)
        throw new ApiError(
          502,
          "invalid_response",
          `Ответ API ${path} не соответствует контракту: ${parsed.error.issues[0]?.path.join(".") || "формат"}`,
        );
      return parsed.data;
    },
    async empty(path: string, options: RequestOptions) {
      await request(path, options);
    },
    async blob(path: string, options: RequestOptions) {
      return (await request(path, options)).blob();
    },
    async text(path: string) {
      return (await request(path)).text();
    },
    async stream(
      path: string,
      options: RequestOptions,
      onEvent: (event: StreamEvent) => void,
    ) {
      const response = await request(path, options);
      if (
        !response.body ||
        !response.headers.get("Content-Type")?.includes("text/event-stream")
      )
        throw new ApiError(
          502,
          "invalid_stream",
          "Сервер не открыл поток ответов.",
        );
      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let buffer = "",
        eventName = "",
        dataLines: string[] = [],
        completed = false;
      function readLine(line: string) {
        if (line === "") {
          if (
            eventName &&
            dataLines.length &&
            Object.hasOwn(streamSchemas, eventName)
          ) {
            const name = eventName as keyof typeof streamSchemas;
            const value: unknown = JSON.parse(dataLines.join("\n"));
            const data = streamSchemas[name].parse(value);
            onEvent({ name, data } as StreamEvent);
            if (name === "done") completed = true;
          }
          eventName = "";
          dataLines = [];
          return;
        }
        const colon = line.indexOf(":");
        if (colon < 1) return;
        const value = line.slice(colon + 1).replace(/^ /, "");
        if (line.slice(0, colon) === "event") eventName = value;
        if (line.slice(0, colon) === "data") dataLines.push(value);
      }
      try {
        while (!completed) {
          const result = await reader.read();
          if (result.done) break;
          buffer += result.value;
          let end = buffer.indexOf("\n");
          while (end >= 0 && !completed) {
            readLine(buffer.slice(0, end).replace(/\r$/, ""));
            buffer = buffer.slice(end + 1);
            end = buffer.indexOf("\n");
          }
        }
        if (!completed)
          throw new ApiError(
            502,
            "interrupted_stream",
            "Поток прервался до завершения ответа.",
          );
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    },
  };
}
