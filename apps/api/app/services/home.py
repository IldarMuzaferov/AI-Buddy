"""Главная: этап, нормализация, «На чём остановились» (кэш в digests), следующий шаг, задачи на сегодня."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.assistant.orchestrator import next_step
from app.db import utcnow
from app.domain import DEFAULT_SUGGESTIONS, NORMALIZATION, STAGES, SUGGESTIONS, today
from app.models import Chat, ChecklistStep, Digest, InternStep, Notification, Task
from app.services.common import InternContext


async def build_digest(session: AsyncSession, intern: InternContext) -> dict | None:
    chats = (await session.execute(select(Chat).where(Chat.user_id == intern.user.id).order_by(Chat.updated_at.desc()))).scalars().all()
    unresolved = next((c for c in chats if c.unresolved), None)
    last = unresolved or (chats[0] if chats else None)
    if last is None:
        return None
    text = f"В последний раз вы разбирались с вопросом «{last.title}»."
    if unresolved:
        text += f" Не решено: {unresolved.title.lower()} — ответ не помог, можно спросить ещё раз или сразу пойти к человеку."
    data = {"chat_id": last.id, "chat_title": last.title, "unresolved": bool(unresolved)}
    digest = await session.get(Digest, {"intern_id": intern.user.id, "day": today()})
    if digest is None:
        session.add(Digest(intern_id=intern.user.id, day=today(), text=text, data=data))
    else:
        digest.text, digest.data, digest.generated_at = text, data, utcnow()
    return {"text": text, **data}


async def stages_view(session: AsyncSession, intern: InternContext) -> list[dict]:
    """Progress is based on the intern's checklist statuses, not elapsed calendar time."""
    idx = next(i for i, stage in enumerate(STAGES) if stage.id == intern.stage.id)
    steps = (await session.execute(
        select(ChecklistStep).order_by(ChecklistStep.order)
    )).scalars().all()
    statuses = {
        row.step_id: row.status
        for row in (await session.execute(
            select(InternStep).where(InternStep.intern_id == intern.user.id)
        )).scalars().all()
    }

    result = []
    for i, stage in enumerate(STAGES):
        stage_steps = [step for step in steps if step.stage == stage.id]
        visible = [step for step in stage_steps if statuses.get(step.id, "todo") != "hidden"]
        done = sum(1 for step in visible if statuses.get(step.id, "todo") == "done")
        progress = round(done / len(visible), 2) if visible else 0.0
        completed = bool(visible) and done == len(visible)
        # Keep the calendar milestone state, but let the fill itself show
        # actual checklist completion for every stage (including earlier ones).
        state = "done" if completed or i < idx else "current" if i == idx else "next"
        result.append({
            "id": stage.id,
            "label": stage.label,
            "state": state,
            "progress": progress,
        })
    return result

async def home_view(session: AsyncSession, intern: InternContext) -> dict:
    step = await next_step(session, intern)
    tasks = (await session.execute(select(Task).where(Task.intern_id == intern.user.id, Task.status.in_(("in_progress", "review")))
                                   .order_by(Task.deadline))).scalars().all()
    unread = (await session.execute(select(Notification).where(Notification.user_id == intern.user.id, Notification.read.is_(False))
                                    .order_by(Notification.created_at.desc()))).scalars().all()
    step_status = None
    if step is not None:
        row = await session.get(InternStep, {"intern_id": intern.user.id, "step_id": step.id})
        step_status = row.status if row else "todo"
    return {
        "stage": {"id": intern.stage.id, "label": intern.stage.label},
        "day": intern.day, "total_days": intern.total,
        "stages": await stages_view(session, intern),
        "normalization_text": NORMALIZATION[intern.stage.id],
        "digest": await build_digest(session, intern),
        "next_step": None if step is None else {"step_id": step.id, "title": step.title, "topic": step.topic, "status": step_status,
                                                 "note": "Шаблон. В вашей команде может отличаться."},
        "tasks_today": [{"id": t.id, "title": t.title, "status": t.status, "deadline": t.deadline.isoformat() if t.deadline else None}
                        for t in tasks],
        "suggestions": SUGGESTIONS.get(intern.stage.id, DEFAULT_SUGGESTIONS),
        "notifications": [{"id": n.id, "kind": n.kind, "text": n.text, "target": n.target, "created_at": n.created_at.isoformat()}
                          for n in unread],
        "privacy_note": "Ваши чаты видите только вы",
    }
