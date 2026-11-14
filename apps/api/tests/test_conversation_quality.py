"""Качество диалога: болтовня не превращается в «ответа нет», поиск не зависит от решения роутера, слабое совпадение решает модель."""
from __future__ import annotations

import json

import pytest

from app.assistant.router import smalltalk_kind
from app.assistant.text import query_groups, query_stems
from app.llm import set_llm
from tests.conftest import first, names, text_of


class StubLLM:
    """Имитация настоящей модели: роутер возвращает заданный маршрут, ответ задаётся строкой."""

    name = "stub"
    is_fake = False

    def __init__(self, route: str, answer: str = "Планёрка проходит каждый день в 10:30.") -> None:
        self.route, self.answer = route, answer
        self.stream_messages = []

    async def complete(self, messages, *, json_mode=False):
        if json_mode:
            return json.dumps({"route": self.route, "topic_group": "other", "topic": "тема", "needs_person": False, "confidence": 0.4})
        return self.answer

    async def stream(self, messages):
        self.stream_messages.append(messages)
        for word in self.answer.split(" "):
            yield word + " "


class ModeAwareLLM(StubLLM):
    async def stream(self, messages):
        self.stream_messages.append(messages)
        system = messages[0]["content"]
        if "РЕЖИМ ОТВЕТА — «НАВЕСТИ»" in system:
            yield "Сначала проверьте, создан ли файл .env. Что в инструкции сказано о запуске?"
        else:
            yield "В корне проекта выполните `docker compose up --build`."


@pytest.mark.parametrize("text,kind", [
    ("привет", "greeting"), ("Привет!", "greeting"), ("здравствуйте", "greeting"), ("Добрый день", "greeting"),
    ("спасибо", "thanks"), ("большое спасибо!", "thanks"), ("ок", "thanks"), ("пока", "bye"),
    ("что ты умеешь?", "about"), ("чем можешь помочь", "about"),
    ("привет, как оформить отгул?", None), ("расскажи про планерку", None), ("спасибо, а где лежит конфиг?", None), ("", None),
])
def test_smalltalk_kind(text, kind):
    assert smalltalk_kind(text) == kind


@pytest.mark.parametrize("text", ["привет", "спасибо", "что ты умеешь?", "пока"])
async def test_smalltalk_gets_friendly_answer_without_person_card(api, text):
    ev = await api.ask(text)
    assert first(ev, "done")["route"] == "smalltalk"
    assert "person_card" not in names(ev) and "source" not in names(ev)
    assert "материалах этого нет" not in text_of(ev)


async def test_greeting_uses_first_name(api):
    assert "Аня" in text_of(await api.ask("привет"))


@pytest.mark.parametrize("question", ["расскажи про планерку", "Расскажи про планёрку", "когда планерка?", "во сколько у нас дейли?"])
async def test_planerka_is_found_in_wiki(api, question):
    ev = await api.ask(question)
    assert first(ev, "done")["route"] == "lookup"
    assert "10:30" in text_of(ev)
    assert any(s["document_id"] == "rituals" for n, s in ev if n == "source")


@pytest.mark.parametrize("router_route", ["no_answer", "smalltalk", "out_of_scope", "lookup"])
async def test_llm_router_cannot_skip_retrieval(api, router_route):
    """Раньше ответ «no_answer» от модели-роутера отключал поиск: «расскажи про планёрку» не находил страницу, которая есть в вики."""
    set_llm(StubLLM(router_route))
    ev = await api.ask("расскажи про планерку")
    assert first(ev, "done")["route"] == "lookup"
    assert "10:30" in text_of(ev)
    assert "person_card" in names(ev) and any(s["document_id"] == "rituals" for n, s in ev if n == "source")


async def test_llm_smalltalk_is_accepted_only_for_real_smalltalk(api):
    set_llm(StubLLM("smalltalk"))
    assert first(await api.ask("привет"), "done")["route"] == "smalltalk"


async def test_llm_unknown_question_is_still_no_answer(api):
    set_llm(StubLLM("lookup"))
    ev = await api.ask("Сколько стоит обед в столовой на третьем этаже?")
    assert first(ev, "done")["route"] == "no_answer"
    assert "person_card" in names(ev)


async def test_weak_match_model_abstains(api):
    """Слабое совпадение (часть слов запроса есть в вики): если модель отвечает NO_ANSWER, текст не показывается, идём к человеку."""
    set_llm(StubLLM("lookup", answer="NO_ANSWER"))
    ev = await api.ask("Кто на планёрке главный по парковке?")
    assert first(ev, "done")["route"] == "no_answer"
    assert "NO_ANSWER" not in text_of(ev) and "материалах этого нет" in text_of(ev)
    assert "person_card" in names(ev)


async def test_weak_match_model_answers_from_documents(api):
    set_llm(StubLLM("lookup", answer="Планёрка проходит ежедневно в 10:30."))
    ev = await api.ask("Кто на планёрке главный по парковке?")
    assert first(ev, "done")["route"] == "lookup"
    assert "10:30" in text_of(ev)
    assert any(s["document_id"] == "rituals" for n, s in ev if n == "source")


@pytest.mark.parametrize("question", ["Расскажи про зарплату Марии", "Какая зарплата у Бориса?", "Меня уволят после стажировки?"])
async def test_sensitive_questions_go_to_people_not_to_guesses(api, question):
    ev = await api.ask(question)
    assert first(ev, "done")["route"] == "no_answer"
    assert "person_card" in names(ev) and "source" not in names(ev)


async def test_llm_out_of_scope_does_not_hide_real_answer(api):
    set_llm(StubLLM("out_of_scope"))
    ev = await api.ask("Когда проходит планёрка?")
    assert first(ev, "done")["route"] == "lookup"
    assert "10:30" in text_of(ev)


async def test_synonym_search_finds_clone_instruction(api):
    ev = await api.ask("Как стянуть репозиторий?")
    sources = [s["document_id"] for n, s in ev if n == "source"]
    assert first(ev, "done")["route"] == "lookup"
    assert set(sources) & {"build", "billing-readme"}
    assert "клон" in text_of(ev).lower() or "склон" in text_of(ev).lower()


async def test_docker_compose_answer_uses_selected_mode_and_source(api):
    llm = ModeAwareLLM("lookup")
    set_llm(llm)

    guided = await api.ask("Как мне запустить docker-compose?", mode="guide")
    assert "Сначала проверьте" in text_of(guided)
    assert "docker compose up --build" not in text_of(guided)
    assert any(payload["step"] == "found" for name, payload in guided if name == "status")
    assert any(s["document_id"] == "local-dev" for n, s in guided if n == "source")
    assert "РЕЖИМ ОТВЕТА — «НАВЕСТИ»" in llm.stream_messages[-1][0]["content"]

    direct = await api.ask("Как мне запустить docker-compose?", mode="direct")
    assert "docker compose up --build" in text_of(direct)
    assert any(payload["step"] == "found" for name, payload in direct if name == "status")
    assert any(s["document_id"] == "local-dev" for n, s in direct if n == "source")
    assert "РЕЖИМ ОТВЕТА — «СРАЗУ ОТВЕТ»" in llm.stream_messages[-1][0]["content"]


def test_stems_treat_word_forms_equally():
    assert query_stems("планёрка") == query_stems("планерку")
    assert query_stems("ветки") == query_stems("ветка")
    assert query_stems("репозиторий") == query_stems("репозитория")


def test_synonym_groups_expand_query():
    (group,) = query_groups("стянуть")
    assert len(group) > 1 and any(s.startswith("склонир") for s in group)
