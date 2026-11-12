import { z } from "zod";

export class MockError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export const missing = () =>
  new MockError(404, "not_found", "Запись не найдена.");
export const invalid = (message: string, code = "invalid_input") =>
  new MockError(400, code, message);
export const conflict = (message: string) =>
  new MockError(409, "conflict", message);
export const denied = () =>
  new MockError(403, "forbidden", "Нет доступа к этому разделу.");
export function required<Value>(value: Value | undefined | null): Value {
  if (value == null) throw missing();
  return value;
}
export const json = (value: unknown, status = 200) =>
  Response.json(value, { status });
export const empty = () => new Response(null, { status: 204 });
export const object = z.record(z.string(), z.unknown());
export const string = z.string().trim().min(1);
export function parse<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid("Проверьте заполнение полей.");
  return result.data;
}
