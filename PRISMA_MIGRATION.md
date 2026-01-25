# Миграция на Prisma БД

## Что было сделано

1. ✅ Создан сервис `TaskService` для работы с Prisma БД (`src/services/database/task.ts`)
2. ✅ Создан скрипт импорта JSON файлов в БД (`scripts/import-json-to-db.ts`)
3. ✅ Обновлен `index.ts` для работы с БД вместо файлов
4. ✅ Добавлена функция очистки БД в роутер удаления (`/tasks/delete`)

## Как использовать

### 1. Генерация Prisma клиента

Перед первым использованием необходимо сгенерировать Prisma клиент:

```bash
npm run prisma:generate
```

Или напрямую:

```bash
npx prisma generate
```

### 2. Импорт существующих JSON файлов в БД

Для импорта всех JSON файлов из папки `data/` в базу данных:

```bash
npm run import-json
```

Скрипт:
- Загружает все JSON файлы из папки `data/`
- Проверяет дубликаты по `id_post`
- Импортирует только новые задачи
- Показывает прогресс импорта

### 3. Использование API

Теперь все эндпоинты работают с БД:

- `GET /api/jobs` - получает все задачи из БД
- `GET /api/jobs/:id` - получает задачу по ID из БД
- `POST /api/crawl` - сохраняет новые задачи в БД
- `POST /tasks/send` - отправляет задачи из БД в API бота
- `POST /tasks/send-one` - отправляет одну задачу из БД

### 4. Очистка БД

Для очистки базы данных используйте эндпоинт `/tasks/delete` с параметром `clearDatabase: true`:

```json
{
  "clearDatabase": true,
  "deleteFiles": false
}
```

Или через curl:

```bash
curl -X DELETE http://localhost:3000/tasks/delete \
  -H "Content-Type: application/json" \
  -d '{"clearDatabase": true}'
```

## Структура данных

Модель `Task` в Prisma соответствует структуре JSON:

- `id` (Int, autoincrement) - внутренний ID в БД
- `id_post` (String) - оригинальный ID поста из Telegram
- `title` (String) - заголовок
- `description` (String) - описание
- `workType` (String) - тип работы
- `payment` (String) - оплата
- `deadline` (String) - срок
- `url` (String) - ссылка на пост
- `channelUrl` (String) - ссылка на канал
- `scrapedAt` (String) - время скрапинга
- `timestamp` (String) - временная метка

## Важные замечания

1. **Переменные окружения**: Убедитесь, что `DATABASE_URL` установлен в `.env`
2. **Миграции**: Если схема БД изменилась, выполните миграции:
   ```bash
   npm run prisma:migrate
   ```
3. **Дубликаты**: Скрипт импорта автоматически пропускает дубликаты по `id_post`
4. **Производительность**: Импорт выполняется батчами по 100 записей

## Откат на файлы

Если нужно временно вернуться к работе с файлами, можно закомментировать использование `TaskService` в `index.ts` и вернуть старую логику `loadJobsFromDataFolder()`.
