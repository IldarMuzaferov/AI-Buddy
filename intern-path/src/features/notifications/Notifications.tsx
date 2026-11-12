import { useState } from "react";
import { useApi, useData, useUpdate } from "@/entities/session/api/client";
import {
  dateLabel,
  ErrorText,
  Glyph,
  Icon,
  QueryState,
} from "@/shared/ui/common";
import { useNavigation } from "@/shared/ui/navigation";

export function Notifications() {
  const api = useApi(),
    query = useData(["notifications"], api.notifications.list, true, 30_000),
    update = useUpdate();
  const go = useNavigation((state) => state.go);
  const [open, setOpen] = useState(false);
  return (
    <div className="notifications-wrap">
      <button
        className="icon-button"
        aria-label="Уведомления"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="bell" />
        {Boolean(query.data?.unread) && (
          <span className="notification-count">{query.data?.unread}</span>
        )}
      </button>
      {open && (
        <div className="menu notif-panel">
          <header>
            <strong>Уведомления</strong>
            <button
              className="text-button"
              disabled={!query.data?.unread || update.isPending}
              onClick={() => update.mutate(api.notifications.readAll)}
            >
              Прочитать все
            </button>
          </header>
          <ErrorText error={update.error} />
          <QueryState query={query}>
            {(data) =>
              data.items.length ? (
                data.items.map((item) => (
                  <button
                    className={`notif-item ${item.read ? "" : "unread"}`}
                    disabled={update.isPending}
                    key={item.id}
                    onClick={() =>
                      update.mutate(async () => {
                        if (!item.read) await api.notifications.read(item.id);
                        const target = item.target;
                        if (target?.route === "mentor") go({ page: "mentor" });
                        if (
                          (target?.route === "chat" ||
                            target?.route === "task") &&
                          target.id
                        )
                          go({ page: target.route, id: target.id });
                        if (target?.action_id && !target.id)
                          go({ page: "actions" });
                        setOpen(false);
                      })
                    }
                  >
                    <Glyph
                      name={
                        item.kind === "access"
                          ? "key"
                          : item.kind === "task"
                            ? "folder"
                            : "bell"
                      }
                    />
                    <span>
                      <strong>{item.text}</strong>
                      <small>{dateLabel(item.created_at)}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="sb-empty">Сейчас всё спокойно.</p>
              )
            }
          </QueryState>
        </div>
      )}
    </div>
  );
}
