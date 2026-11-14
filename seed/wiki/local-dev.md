---
id: local-dev
title: Запуск AI-Buddy через Docker Compose
url: https://wiki.example.test/payments/local-dev
system: README
owner: boris
team: payments
access_level: team
space: team
updated_at: 2026-11-14
---
## Запуск проекта
Чтобы запустить проект через docker-compose, откройте PowerShell в корне репозитория. Если файла `.env` ещё нет, создайте его командой `Copy-Item .env.example .env`; существующий `.env` не перезаписывайте. Затем выполните `docker compose up --build`. Фронтенд откроется на http://localhost:5173, документация API — на http://localhost:8000/docs.
