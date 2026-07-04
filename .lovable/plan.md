# Phase 2 — Club Members Foundation (v2)

## 1. Правки архитектуры относительно v1

- **Только зарегистрированные пользователи.** `club_members.user_id` — `NOT NULL`, FK на `auth.users`. Гостей (оффлайн-игроков без аккаунта) выносим в отдельную будущую фазу.
- **Никаких триггеров синхронизации.** `club_members` и `user_roles` меняются исключительно через SECURITY DEFINER RPC. Каждая RPC атомарно (в одной транзакции) обновляет обе таблицы. Триггер остаётся только служебный — `updated_at`.
- **`auth.ts` и текущая авторизация не трогаются в Phase 2.** RLS-политики и `has_role` / `can_manage_club` продолжают читать `user_roles`. `club_members` — параллельный слой «людей клуба», который заполняется теми же RPC, что и `user_roles`. Переход существующих экранов на новый слой — отдельными шагами, поштучно.
- **Центральный экран «Участники клуба».** Phase 2 обязана дать рабочий инструмент управления: список участников, смена роли, удаление, выход. Из него в будущем будут открываться Досье, Игры, Затраты, история.
- **Сначала работающий функционал, потом миграция.** Порядок фаз перестроен: сперва таблица + backfill + RPC + рабочий экран участников, только после этого — постепенный перевод остальных разделов.

## 2. Модель `club_members` (итог)

Смысловые поля:

- `club_id` → `clubs.id` (NOT NULL)
- `user_id` → `auth.users.id` (NOT NULL) — гость появится позже отдельным полем/статусом.
- `display_name` — клубный ник (NOT NULL). Инициализируется из `profiles.display_name`. UI показывает `COALESCE(club_members.display_name, profiles.display_name)`.
- `role` — `app_role`, одна активная роль на пару (club, user). `creator` сюда не пишется.
- `status` — `active | left | removed | banned` (по умолчанию `active`).
- `joined_at`, `left_at`, `notes`.

Уникальность и индексы:

- `UNIQUE (club_id, user_id) WHERE status = 'active'` — один активный участник на клуб.
- Индексы: `(club_id, status)`, `(user_id)`.

Инварианты (поддерживаются вручную внутри RPC, без триггеров):

- Каждая активная строка `club_members` соответствует ровно одной строке `user_roles(user_id, role=club_members.role, club_id)`.
- При `status <> 'active'` строки в `user_roles` для этой пары нет.
- `creator` живёт только в `user_roles`, `club_members` не создаётся.

Связь с существующими сущностями:

```text
auth.users ──► club_members ◄── clubs
                    │
                    └── (зеркало через RPC) user_roles   ← используется RLS
```

## 3. Пошаговый план реализации

Порядок выстроен так, чтобы после Phase 2.4 клуб уже был управляем через новый экран, а Phase 2.5+ только расширяли использование `club_members` в существующих модулях без риска регрессий.

### Phase 2.1 — Таблица `club_members` (миграция БД)

- `CREATE TABLE public.club_members` c полями выше, FK, `updated_at`-триггер.
- GRANT SELECT/INSERT/UPDATE/DELETE `authenticated`, ALL `service_role`.
- ENABLE RLS.
- Политики:
  - SELECT: `private.is_member_of_club(auth.uid(), club_id) OR private.is_creator(auth.uid())`.
  - INSERT/UPDATE/DELETE: запрещены напрямую (только через SECURITY DEFINER RPC).
- Частичный UNIQUE, индексы.

### Phase 2.2 — Backfill из `user_roles`

- Миграция: для каждой `user_roles` с `club_id IS NOT NULL` и `role <> 'creator'` вставить `club_members` со `status='active'`, `display_name` из `profiles`, `joined_at = user_roles.created_at`.
- Проверка инварианта: одна активная строка на пару (club_id, user_id). При коллизиях — оставить строку с более «сильной» ролью (owner > co_owner > manager > dealer > player), остальные конвертировать в `status='left'`.

### Phase 2.3 — RPC-слой (единая точка изменений)

Все функции — SECURITY DEFINER, `set search_path = public`, с проверкой прав и записью в `audit_log`. Каждая функция атомарно меняет `club_members` **и** `user_roles`.

- `approve_membership_request(_request_id, _role)` — расширить существующую: помимо вставки в `user_roles`, создать или реактивировать `club_members` (`status='active'`, `role=_role`, `joined_at=now()`, `left_at=NULL`).
- `list_club_members(_club_id)` — вернуть `id, user_id, display_name (COALESCE), role, status, joined_at`; только для членов клуба и Creator.
- `change_member_role(_member_id, _role)` — Owner/Creator; UPDATE `club_members.role`; в `user_roles` удалить старую роль и вставить новую для этой пары; запрет менять роль последнего Owner.
- `remove_member(_member_id)` — Owner/Creator; `status='removed'`, `left_at=now()`; удалить `user_roles` для этой пары; запрет удалять последнего Owner; запрет удалять самого себя (для этого есть leave).
- `leave_club(_club_id)` — сам участник; `status='left'`, `left_at=now()`; удалить `user_roles`; запрет уходить последнему Owner.
- `rename_member(_member_id, _display_name)` — сам участник или Owner/Creator; обновляет клубный ник.

Все функции пишут `log_action(...)`.

### Phase 2.4 — Экран «Участники клуба» (рабочий инструмент)

Новый маршрут `src/routes/members.tsx` (авторизованный, как остальные внутренние страницы). Именно этот экран делает Phase 2 полезной для пользователя.

Функции экрана в Phase 2:
- Список участников клуба через `list_club_members` (имя, роль, дата вступления, статус).
- Смена роли (Owner/Creator, с проверками на бэкенде).
- Удаление участника (Owner/Creator).
- Кнопка «Выйти из клуба» для себя (для всех, кроме единственного Owner).
- Переименование клубного ника.
- Ссылка на экран из основной навигации.

Что НЕ входит в Phase 2 (готовятся точки расширения, но не реализуются):
- Открытие Досье игрока (карточка).
- История игр, затрат, кэша по участнику.
- Приглашение по ссылке, гости.

После Phase 2.4 приложение уже даёт полноценное управление составом клуба через единый экран.

### Phase 2.5 — Клиентский слой без правки авторизации

- Новый модуль `src/lib/club-members.ts`: типы + обёртки над RPC (`listMembers`, `changeRole`, `removeMember`, `leaveClub`, `renameMember`).
- Регенерация `types.ts`.
- `auth.ts`, `auth-guards.ts`, `membership.ts` **не меняются**. Роль и список клубов по-прежнему читаются из `user_roles` — совместимость сохранена.

### Phase 2.6 — Точечная интеграция в существующие экраны (без редизайна)

Здесь мы только используем `club_members` там, где это безопасно и очевидно, не переписывая рабочую логику:

- `/notifications` — approve заявки продолжает вызывать `approve_membership_request`, но теперь RPC создаёт и `club_members` (изменение прозрачно для UI).
- В шапке / `/select-club` — без изменений (читают `user_roles`).
- Все места, где раньше показывался список «людей клуба» (если такие уже есть заглушки) — переключить на `list_club_members`.

### Phase 2.7 — Верификационный чек-лист (обязательно перед закрытием фазы)

- Approve заявки: появляется строка и в `user_roles`, и в `club_members`.
- Смена роли: `club_members.role` и `user_roles` согласованы; последнего Owner нельзя понизить.
- Удаление участника: `club_members.status='removed'`, `user_roles` очищен, доступа к клубу нет.
- Выход из клуба: то же, но `status='left'`; пользователь не видит клуб в списке; повторная заявка возможна.
- Повторное вступление: реактивирует ту же карточку (`status='active'`), история сохраняется.
- RLS: чужой клуб не читает `club_members`; Creator видит любой клуб через Support Mode.
- Существующие экраны (login, select-club, games, cash, expenses, notifications) работают без регрессий.

### Phase 2.8 — Подготовка контракта для будущих модулей

Только документация, без кода:

- Зафиксировать в `.lovable/plan.md`: все будущие таблицы (games, cash, expenses, dossier) ссылаются на `club_members.id`, не на `auth.users.id` и не на `user_roles.id`.
- Отметить открытые вопросы для следующих фаз: гости, приглашение по ссылке, история активности на карточке участника, миграция poker-store в БД.

## 4. Явно вынесено за рамки Phase 2

- Гости / оффлайн-игроки без аккаунта.
- Триггеры синхронизации `club_members` ↔ `user_roles`.
- Переработка `auth.ts` / `auth-guards.ts` и переход RLS на `club_members`.
- Досье игрока, история игр/затрат/кэша по участнику.
- Миграция `poker-store` из localStorage.
