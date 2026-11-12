import type { Task } from "@/shared/api/contracts";
import {
  Badge,
  dateLabel,
  Icon,
  taskColors,
  taskLabels,
} from "@/shared/ui/common";

export function TaskSummary({ task }: { task: Task }) {
  return (
    <section className="panel task-summary">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{task.external_id}</span>
          <h2>{task.title}</h2>
        </div>
        <Badge color={taskColors[task.status]}>
          {task.status_label ?? taskLabels[task.status]}
        </Badge>
      </div>
      <p className="lead">
        <Icon name="calendar" /> Срок: {dateLabel(task.deadline)}
      </p>
      {task.description && (
        <details>
          <summary>Из трекера</summary>
          <p className="pre-line">{task.description}</p>
        </details>
      )}
    </section>
  );
}
