import { useEffect, useRef, type ReactNode } from "react";
import icons from "./icons.json";

export const PROJECT_NAME = "Путь стажёра";
export const taskLabels = {
  new: "Новая",
  in_progress: "В работе",
  review: "На ревью",
  done: "Закрыта в трекере",
};
export const taskColors = {
  new: "neutral",
  in_progress: "info",
  review: "wait",
  done: "good",
};
export function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}
export function Glyph({
  name,
  color = "blue",
}: {
  name: keyof typeof icons;
  color?: string;
}) {
  return (
    <span className={`object-icon ${color}`}>
      <Icon name={name} />
    </span>
  );
}
export function Badge({
  children,
  color = "neutral",
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span className={`status ${color}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function Avatar({
  name,
  color = "purple",
  size = "",
}: {
  name: string;
  color?: string;
  size?: string;
}) {
  return (
    <span className={`avatar ${color} ${size}`} aria-hidden="true">
      {name
        .replaceAll(".", "")
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function Hero({ note }: { note?: string }) {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="orbit orbit-blue" />
      <div className="orbit orbit-purple" />
      <img src="/assets/hero.png" alt="" />
      {note && (
        <div className="floating-note">
          <Icon name="shield" /> {note}
        </div>
      )}
    </div>
  );
}
export function ErrorText({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="inline-error">
      {error instanceof Error ? error.message : "Не удалось выполнить запрос."}
    </p>
  ) : null;
}
export function QueryState<Data>({
  query,
  children,
}: {
  query: {
    data: Data | undefined;
    isPending: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  children: (data: Data) => ReactNode;
}) {
  if (query.isPending)
    return (
      <div className="sk sk-line" aria-label="Загрузка" aria-busy="true" />
    );
  if (query.error)
    return (
      <div className="empty-block">
        <ErrorText error={query.error} />
        <button className="btn" onClick={() => query.refetch()}>
          Повторить
        </button>
      </div>
    );
  return query.data !== undefined ? children(query.data) : null;
}
export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty-block">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    if (!dialog.current?.contains(previous)) dialog.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <div className="overlay" onClick={onClose}>
      <section
        ref={dialog}
        tabIndex={-1}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]",
            ) ?? [],
          );
          const first = focusable[0],
            last = focusable.at(-1);
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === dialog.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export const asString = (value: unknown) =>
  typeof value === "string" ? value : "";
export const formText = (form: FormData, name: string) =>
  asString(form.get(name)).trim();
export const splitList = (text: string) =>
  text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
export function dateLabel(value?: string | null) {
  if (!value) return "—";
  const timestamp = new Date(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value)
      ? value + "Z"
      : value,
  );
  return Number.isNaN(timestamp.getTime())
    ? value
    : timestamp.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(value.length > 10
          ? { hour: "2-digit", minute: "2-digit" }
          : { timeZone: "UTC" }),
      });
}
export function safeLink(url?: string | null) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, location.origin);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
