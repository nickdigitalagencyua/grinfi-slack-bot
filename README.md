# Grinfi → Slack Bot

Принимает webhook-события от Grinfi и отправляет ежедневный отчёт в Slack.

## Что делает

- Получает событие `sender_profile_sent_linkedin_connection_request` от Grinfi
- Считает инвайты по каждому аккаунту в течение дня
- В 18:00 по Киеву отправляет сводку в Slack:

```
📊 Итоги дня — LinkedIn инвайты

• Account #1: отправлено 15 инвайтов
• Account #2: отправлено 12 инвайтов

Итого: 27 инвайтов со всех аккаунтов
```

## Deploy на Railway

1. Загрузи этот проект на GitHub (новый репозиторий)
2. Зайди на railway.app → New Project → Deploy from GitHub
3. Выбери репозиторий
4. В разделе Variables добавь:
   - `SLACK_WEBHOOK_URL` = твой Slack Incoming Webhook URL
5. После деплоя скопируй публичный URL проекта (Settings → Networking → Generate Domain)

## Endpoints

| Method | Path | Описание |
|--------|------|----------|
| POST | `/webhook/grinfi` | Принимает события от Grinfi |
| GET | `/health` | Текущие счётчики за день |
| POST | `/trigger-report` | Отправить отчёт вручную (для теста) |

## Настройка Grinfi

В Grinfi → Settings → Webhooks → Create webhook:
- **Event:** `Sender Profile Sent Linkedin Connection Request`
- **Target URL:** `https://ВАШ-ДОМЕН.railway.app/webhook/grinfi`

## Локальный запуск

```bash
npm install
SLACK_WEBHOOK_URL=https://hooks.slack.com/... npm start
```
