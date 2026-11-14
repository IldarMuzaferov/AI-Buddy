"""Простая обработка русского текста: токены, грубые основы, стоп-слова."""
from __future__ import annotations

import re
from functools import lru_cache

try:  # настоящий русский стеммер: «ветки/ветка», «планёрка/планерку» дают одну основу
    import snowballstemmer

    _STEMMER = snowballstemmer.stemmer("russian")
except ImportError:  # pragma: no cover - запасной вариант без зависимости
    _STEMMER = None

STOPWORDS = {
    "как", "где", "что", "кто", "кого", "кому", "чем", "это", "этот", "эта", "эти", "мне", "меня", "мой", "моя", "мои", "моё", "мою",
    "для", "при", "про", "над", "под", "без", "или", "ли", "не", "нет", "да", "есть", "был", "была", "было", "будет", "нужно",
    "нужен", "нужна", "надо", "можно", "какой", "какая", "какие", "какую", "такое", "такой", "вот", "уже", "ещё", "еще", "все",
    "всё", "его", "её", "их", "она", "они", "оно", "тут", "там", "здесь", "сейчас", "подскажи", "подскажите", "покажи", "расскажи",
    "скажи", "пожалуйста", "привет", "лежит", "находится", "получить", "сделать", "делать", "нам", "вам", "нас", "вас", "так",
    "когда", "почему", "зачем", "расскажите", "объясни", "объясните", "опиши", "опишите", "поясни", "хочу", "узнать", "знать",
    "интересно", "подробнее", "немного", "сколько", "какого", "каком", "каких", "куда", "откуда", "просто", "типа", "вообще", "the", "and", "for", "with", "что-то", "через", "чтобы", "если", "тоже", "очень",
}

_WORD = re.compile(r"[a-zA-Zа-яА-ЯёЁ0-9][a-zA-Zа-яА-ЯёЁ0-9\-]*")


def tokens(text: str) -> list[str]:
    return [w.lower().replace("ё", "е") for w in _WORD.findall(text or "")]


def light_stem(word: str) -> str:
    """Грубая основа (первые 5 букв). Её использует хеш-эмбеддер: векторы в БД посчитаны по ней."""
    return word[:5] if len(word) > 5 else word


@lru_cache(maxsize=8192)
def stem(word: str) -> str:
    if _STEMMER is not None and re.fullmatch(r"[а-я]+", word):
        return _STEMMER.stemWord(word)
    if re.fullmatch(r"[a-z0-9\-]+", word):  # латиница: без обрезки, иначе «standup» и «stands» совпадут
        return word[:-1] if len(word) > 4 and word.endswith("s") else word
    return light_stem(word)


def stems(text: str) -> list[str]:
    result: list[str] = []
    for w in tokens(text):
        if len(w) < 3 or w in STOPWORDS:
            continue
        result.append(stem(w))
        if "-" in w:  # «billing-service» находится и по «billing», и по «service»
            result.extend(stem(p) for p in w.split("-") if len(p) >= 3 and p not in STOPWORDS)
    return result


def light_stems(text: str) -> list[str]:
    return [light_stem(w) for w in tokens(text) if len(w) >= 3 and w not in STOPWORDS]


def query_stems(text: str) -> list[str]:
    seen: list[str] = []
    for s in stems(text):
        if s not in seen:
            seen.append(s)
    return seen


# Слова из одной строки взаимозаменяемы при поиске: «стянуть репозиторий» найдёт «склонируйте репозиторий».
SYNONYM_GROUPS = (
    ("планёрка", "стендап", "дейли", "daily", "standup"),
    ("клонировать", "склонировать", "стянуть", "скачать", "клон", "clone"),
    ("ветка", "бранч", "branch"),
    ("ревью", "ревьюер", "review", "кодревью", "code-review"),
    ("доступ", "допуск", "права", "разрешение"),
    ("ноутбук", "ноут", "макбук", "компьютер", "laptop"),
    ("деплой", "выкатка", "раскатка", "релиз", "deploy", "release"),
    ("стажёр", "стажер", "интерн", "новичок"),
    ("конфиг", "конфигурация", "настройки", "config"),
    ("наставник", "ментор", "бадди", "buddy"),
    ("руководитель", "лид", "тимлид", "начальник", "менеджер"),
    ("мониторинг", "дашборд", "графана", "grafana", "метрики"),
    ("глоссарий", "жаргон", "термин", "сокращение"),
)


def _build_synonyms() -> dict[str, frozenset[str]]:
    table: dict[str, set[str]] = {}
    for group in SYNONYM_GROUPS:
        members = {stem(w.lower().replace("ё", "е")) for w in group}
        for member in members:
            table.setdefault(member, set()).update(members)
    return {k: frozenset(v) for k, v in table.items()}


_SYNONYMS = _build_synonyms()


def query_groups(text: str) -> list[frozenset[str]]:
    """Основы запроса вместе с синонимами: слово засчитывается, если найдена любая основа из группы."""
    return [_SYNONYMS.get(s, frozenset({s})) | {s} for s in query_stems(text)]


def short_topic(text: str, words: int = 6) -> str:
    cleaned = re.sub(r"[?!.]+$", "", (text or "").strip())
    parts = cleaned.split()
    return " ".join(parts[:words]) + ("…" if len(parts) > words else "")


def first_sentences(text: str, limit: int = 420) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    dot = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[: dot + 1] if dot > 80 else cut.rstrip() + "…"
