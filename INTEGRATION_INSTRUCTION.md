# ЧҮКӨ Modern 3D — инструкция по интеграции на сайт X2 LOTO и подключению к LMS

## 1. Цель работ

Необходимо разместить готовую браузерную игру `ЧҮКӨ Modern 3D` на инфраструктуре X2 LOTO и подключить её к действующей LMS так, чтобы:

- авторизованный пользователь открывал игру из сайта X2 LOTO;
- игра получала пользовательскую сессию, баланс, валюту, язык и доступные номиналы;
- при каждой новой REAL-игре билет создавался в LMS до броска САКА;
- LMS возвращала неизменяемый результат билета (`scenario`), сумму выигрыша (`win`) и новый баланс;
- клиентская 3D-игра визуализировала именно этот сценарий;
- никакая денежная математика REAL-режима не рассчитывалась клиентом;
- события игры могли использоваться сайтом X2 для пополнения, аналитики и синхронизации UI.

Рекомендуемая архитектура — **игра как отдельная статическая web-страница в iframe + обмен с родительской страницей через `postMessage` + прямой HTTP-запрос игры к LMS PayTicket**.

---

# 2. Архитектура

```text
┌─────────────────────────────────────────────────────────┐
│                    сайт X2 LOTO                         │
│                                                         │
│   аккаунт / авторизация / баланс / платежи              │
│                     │                                   │
│                     │ postMessage                       │
│                     ▼                                   │
│   ┌─────────────────────────────────────────────────┐   │
│   │ iframe: ЧҮКӨ Modern 3D                           │   │
│   │                                                  │   │
│   │ game.js → lms-adapter.js                         │   │
│   └──────────────────────┬───────────────────────────┘   │
└──────────────────────────┼───────────────────────────────┘
                           │ HTTPS GET PayTicket
                           │ session/cookie/header
                           ▼
                ┌──────────────────────┐
                │         LMS          │
                │ Lotto.Users.cls ... │
                └──────────────────────┘
```

Игра является клиентом LMS только для создания билета. Родительская страница отвечает за окружающий пользовательский контекст сайта: вход, пополнение, переходы и т.д.

---

# 3. Что уже реализовано в игре

Программисту **не требуется заново писать**:

- 3D/Havok механику;
- UI номиналов;
- игровой цикл;
- DEMO;
- REAL/DEMO switch;
- автоигру;
- историю последних билетов;
- таблицу выплат/Info;
- локализацию;
- LMS adapter;
- обработку сценариев;
- обработку баланса после билета;
- postMessage события.

Основная задача программиста — корректно состыковать существующий адаптер с production LMS и страницей сайта.

---

# 4. Размещение статических файлов

Вся папка игры должна отдаваться HTTPS-сервером без изменения относительной структуры.

Обязательные типы контента:

```text
.html    text/html
.css     text/css
.js      application/javascript
.webp    image/webp
.svg     image/svg+xml
.mp3     audio/mpeg
.glb     model/gltf-binary
```

GLB можно отдавать как `application/octet-stream`, если сервер не поддерживает `model/gltf-binary`, но правильный MIME предпочтительнее.

Нельзя запускать production-сборку через `file://`.

---

# 5. Встраивание в сайт

## 5.1. Рекомендуемый iframe

Пример:

```html
<iframe
  id="chuko-game"
  src="https://games.x2.kg/chuko/index.html"
  title="ЧҮКӨ"
  style="width:100%;height:100dvh;border:0;display:block"
  allow="autoplay"
></iframe>
```

Внутри игры уже есть собственная адаптация размера под mobile/WebView и ограничение игровой области по пропорциям.

Если применяется `sandbox`, минимум должен позволять JS и same-origin поведение:

```html
sandbox="allow-scripts allow-same-origin"
```

Перед использованием sandbox обязательно проверить доступ к LMS, cookies и аудио.

## 5.2. Заголовки страницы игры

Если игра находится на другом origin, чем основной сайт, сервер игры не должен блокировать iframe через `X-Frame-Options: DENY`.

Предпочтительно настроить CSP:

```text
Content-Security-Policy: frame-ancestors https://x2.kg https://www.x2.kg;
```

Указать реальные домены проекта.

---

# 6. Production-настройки `lms-config.js`

Перед релизом изменить:

```js
window.X2_GAME_CONFIG = {
  gameId: '<REAL_LMS_GAME_ID>',

  denomination: 25,
  denominations: [25, 50, 100],

  language: 'RU',
  currency: 'KGS',
  currencyDisplay: 'сом',

  mode: 'real',
  demoAllowed: true, // false, если DEMO на production не нужен

  mock: false,

  apiBase: '',
  endpoints: {
    newGame: 'https://<LMS-HOST>/api/Lotto.Users.cls',
    balance: '/api/lms/player/balance' // normal REAL flow его не использует
  },

  initMode: 'postMessage',
  sessionMode: 'postMessage',
  sessionHeader: 'X-Session-ID',

  parentOrigin: 'https://x2.kg',
  allowedParentOrigins: ['https://x2.kg'],

  requestTimeoutMs: 10000
};
```

### Критично

В текущей реализации `game.js` передаёт в `PayTicket` `LMS_CFG.gameId`. Поэтому **реальный идентификатор игры обязательно должен быть прописан в `lms-config.js`**.

Не полагаться только на `gameId`, присланный в `X2_LMS_INIT`, пока код специально не изменён под runtime gameId.

---

# 7. Инициализация через postMessage

## 7.1. Игра сообщает готовность

После загрузки iframe игра отправляет родителю:

```js
{
  source: 'X2_CHUKO',
  type: 'X2_GAME_READY',
  gameId: 'CHUKO',
  needsInit: true,
  needsSession: true
}
```

`source: 'X2_CHUKO'` рекомендуется использовать как дополнительную проверку сообщений.

## 7.2. Родитель передаёт INIT

После `X2_GAME_READY` сайт должен отправить в iframe:

```js
iframe.contentWindow.postMessage({
  type: 'X2_LMS_INIT',

  session: '<CURRENT_USER_SESSION>',

  gameId: '<REAL_LMS_GAME_ID>',
  denomination: 25,
  denominations: [25, 50, 100],

  currency: 'KGS',
  currencyDisplay: 'сом',

  language: 'RU',
  mode: 'real',
  demoAllowed: true,
  demoBalance: 10000,

  // ВАЖНО: первоначальный REAL-баланс пользователя.
  balance: 1250
}, GAME_ORIGIN);
```

`GAME_ORIGIN` должен быть точным origin игры, а не `'*'`.

Поддерживаемые языки текущей сборки:

```text
RU
KG
EN
ZH
```

Если передан неизвестный язык — игра стартует на RU.

---

# 8. Сессия

Адаптер поддерживает три схемы.

## Вариант A — `postMessage` (рекомендуемый текущей архитектурой)

```js
sessionMode: 'postMessage'
```

Session можно передать прямо в `X2_LMS_INIT`.

Также существует отдельное сообщение:

```js
{
  type: 'X2_LMS_SESSION',
  session: '<SESSION>'
}
```

При HTTP-запросе значение добавляется в заголовок, заданный `sessionHeader`, по умолчанию:

```text
X-Session-ID: <SESSION>
```

## Вариант B — query

```js
sessionMode: 'query'
```

URL:

```text
https://games.x2.kg/chuko/?session=...
```

Для production этот вариант использовать только если это принято политикой безопасности: session попадает в URL, логи и историю.

## Вариант C — cookie

```js
sessionMode: 'cookie'
```

Адаптер не добавляет session-header и полагается на cookie. Все LMS fetch уже выполняются с:

```js
credentials: 'include'
```

Для cross-site cookie должны быть корректно настроены `SameSite=None; Secure`.

---

# 9. PayTicket — основной запрос LMS

Игра использует GET:

```http
GET <newGame>?Method=PayTicket&gameId=<GAME_ID>&amount=<DENOMINATION>
```

Пример формы URL:

```text
https://<LMS-HOST>/api/Lotto.Users.cls?Method=PayTicket&gameId=<GAME_ID>&amount=25
```

Поля `currency` и `language` в PayTicket текущий adapter не отправляет: они устанавливаются на этапе инициализации.

---

# 10. Обязательный ответ PayTicket

Для продолжения игры LMS обязана вернуть значения, из которых adapter может получить:

```json
{
  "ticketId": "123456789",
  "scenario": 3,
  "win": 50,
  "balance": 1275
}
```

Минимально обязательны:

- идентификатор билета;
- известный сценарий;
- числовой `win >= 0`;
- числовой итоговый баланс после билета.

Adapter также понимает следующие алиасы:

### Ticket ID

```text
ticketId
ticket_id
ticketNumber
ticket_number
```

### Scenario

```text
scenario
scenarioId
scenario_id
scenarioKey
```

Сценарий допускается numeric ID либо строковый ключ (`ZERO`, `ONE`, ...).

### Win

```text
win
prize
winAmount
```

### Balance

```text
balance
newBalance
balanceAfterGame
```

При отсутствии любого критичного значения adapter возвращает техническую ошибку и не начинает бросок.

---

# 11. Сценарии LMS

| ID | key | Что визуализирует игра |
|---:|---|---|
| 1 | `ZERO` | 0 чүкө |
| 2 | `ONE` | 1 чүкө |
| 8 | `ONE_KHAN` | 1 чүкө + ХАН |
| 3 | `TWO` | 2 чүкө |
| 9 | `TWO_KHAN` | 2 чүкө + ХАН |
| 6 | `THREE` | 3 чүкө |
| 10 | `THREE_KHAN` | 3 чүкө + ХАН |
| 7 | `FOUR` | 4 чүкө |
| 11 | `FOUR_KHAN` | 4 чүкө + ХАН |
| 4 | `FIVE` | 5 чүкө |
| 5 | `FIVE_KHAN` | 5 чүкө + ХАН |

Эти ID зафиксированы в `src/scenario-config.js`.

ID `1..7` оставлены без изменений для обратной совместимости. Новые варианты `+ ХАН` добавлены отдельными ID `8..11`.

Если LMS вернёт неизвестный scenario, билет не будет визуализирован и adapter сформирует `BAD_SCENARIO_RESPONSE`.

---

# 12. Денежная логика

## REAL

Клиент **не должен** считать выигрыш по таблице сценариев.

Авторитетны только:

```text
PayTicket.win
PayTicket.balance
```

Поля `demoMultiplier` относятся только к локальному DEMO.

## Когда баланс показывается игроку

После `PayTicket` значение `balance` сохраняется как `pendingBalance`.

Игровая анимация завершается — только после этого UI принимает точный баланс LMS.

Это сделано, чтобы игрок не увидел финансовый результат раньше визуального завершения билета.

---

# 13. DEMO

Если:

```js
demoAllowed: true
```

игра показывает REAL/DEMO переключатель.

DEMO:

- не вызывает `PayTicket`;
- использует `demoBalance`;
- циклически использует сценарии;
- рассчитывает выигрыш по `demoMultiplier`.

Если DEMO на production не разрешён:

```js
demoAllowed: false
mode: 'real'
```

---

# 14. События от игры в родительский сайт

Все события имеют:

```js
{
  source: 'X2_CHUKO',
  type: '...'
}
```

## `X2_GAME_READY`

Игра загрузилась и ждёт init/session.

## `X2_GAME_BALANCE_LOADED`

```js
{
  gameId,
  balance,
  currency,
  currencyDisplay,
  mode
}
```

## `X2_GAME_DENOMINATION_CHANGED`

```js
{
  gameId,
  denomination,
  currency,
  language,
  mode
}
```

## `X2_GAME_MODE_CHANGED`

```js
{
  gameId,
  mode,
  currency,
  language,
  denomination
}
```

## `X2_GAME_TICKET_READY`

Билет успешно получен и разрешён бросок:

```js
{
  gameId,
  ticketId,
  scenario,
  scenarioKey,
  denomination,
  currency,
  currencyDisplay,
  language,
  mode
}
```

## `X2_GAME_ROUND_COMPLETE`

```js
{
  gameId,
  ticketId,
  scenario,
  scenarioKey,
  win,
  balance,
  denomination,
  currency,
  currencyDisplay,
  language,
  mode
}
```

Этот event удобен для синхронизации внешнего баланса сайта и аналитики.

## `X2_GAME_DEPOSIT_REQUEST`

Игрок нажал `+` возле баланса.

Родительская страница должна открыть стандартный flow пополнения X2.

## `X2_GAME_HELP_REQUEST`

Событие запроса раздела помощи/информации. Его можно использовать для внешней аналитики или общего help-flow.

## `X2_GAME_ERROR`

Технический канал.

Примеры `stage`:

```text
newGame
balance
scenarioScatter
```

Программист сайта должен логировать/телеметрировать событие, но **никогда не выводить игроку `code` или `message` как есть**.

Особенно `SCENARIO_FORCED_COMPLETE` — внутренний технический сигнал о том, что визуальный план пришлось завершить резервным способом. Финансовый результат билета при этом уже определён LMS.

---

# 15. Пример parent bridge

```js
const iframe = document.getElementById('chuko-game');
const GAME_ORIGIN = 'https://games.x2.kg';

window.addEventListener('message', async event => {
  if (event.origin !== GAME_ORIGIN) return;

  const msg = event.data || {};
  if (msg.source !== 'X2_CHUKO') return;

  switch (msg.type) {
    case 'X2_GAME_READY': {
      iframe.contentWindow.postMessage({
        type: 'X2_LMS_INIT',
        session: window.currentLmsSession,
        denomination: 25,
        denominations: [25, 50, 100],
        currency: 'KGS',
        currencyDisplay: 'сом',
        language: 'RU',
        mode: 'real',
        demoAllowed: true,
        balance: window.currentBalance
      }, GAME_ORIGIN);
      break;
    }

    case 'X2_GAME_ROUND_COMPLETE': {
      // Не пересчитывать баланс самостоятельно.
      updateSiteBalance(msg.balance);
      analytics.track('chuko_round_complete', msg);
      break;
    }

    case 'X2_GAME_DEPOSIT_REQUEST': {
      openDepositModal();
      break;
    }

    case 'X2_GAME_ERROR': {
      // Для логов/мониторинга. НЕ показываем raw message пользователю.
      telemetry.report('chuko_game_error', msg);
      break;
    }
  }
});
```

---

# 16. CORS и безопасность LMS

Если LMS находится на другом origin, необходимо разрешить запросы с origin игры.

Так как adapter использует:

```js
credentials: 'include'
```

при credentialed CORS нельзя использовать:

```text
Access-Control-Allow-Origin: *
```

Нужно вернуть конкретный origin игры.

Если используется `X-Session-ID`, серверу также нужно разрешить этот header в CORS/preflight.

Примерная серверная логика:

```text
Access-Control-Allow-Origin: https://games.x2.kg
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: X-Session-ID, Content-Type, Accept
Access-Control-Allow-Methods: GET, OPTIONS
```

Настроить конкретно под инфраструктуру X2/LMS.

---

# 17. CSP

Сейчас `index.html` загружает Babylon/Havok извне.

Если оставляем CDN, CSP должен разрешить соответствующие script-src.

Для максимально контролируемого production лучше скачать эти runtime-зависимости на собственный static host, проверить лицензии/версии и зафиксировать их вместе со сборкой игры.

---

# 18. Ошибки, которые должны обрабатываться корректно

Adapter уже создаёт/нормализует, в частности:

```text
INIT_TIMEOUT
SESSION_REQUIRED
SESSION_TIMEOUT
SESSION_EXPIRED
INSUFFICIENT_FUNDS
LMS_TIMEOUT
LMS_HTTP_<status>
BAD_TICKET_RESPONSE
BAD_SCENARIO_RESPONSE
BAD_WIN_RESPONSE
BAD_BALANCE_RESPONSE
```

На стороне игрока должны оставаться только понятные локализованные сообщения.

Raw технические ошибки — только мониторинг.

---

# 19. Production UI cleanup

Перед боевым релизом согласовать:

- оставить или скрыть FPS/performance panel;
- убрать нижнюю debug-строку с номером build/Babylon/Havok;
- оставить ли языковой switch в самой игре или язык задаёт только LMS;
- оставить ли DEMO переключатель;
- финальный список номиналов;
- финальные тексты таблицы выплат.

Это UI-cleanup, к LMS контракту отношения не имеет.

---

# 20. Версионирование и cache busting

Сейчас JS/CSS подключаются с query build version:

```text
styles.css?v=...
src/game.js?v=...
...
```

Перед production-релизом:

1. назначить единый номер build;
2. поставить его во всех JS/config/index ссылках;
3. HTTP для `index.html` — `no-cache` или короткий cache;
4. тяжёлые immutable assets (`glb`, `webp`, `mp3`) можно кэшировать дольше, желательно с versioned filename/hash при последующих заменах.

---

# 21. Acceptance / приёмочные тесты

## Инициализация

- iframe открывается без JS ошибок;
- приходит `X2_GAME_READY`;
- INIT принимается только от разрешённого origin;
- корректно показываются валюта, баланс, язык и номиналы.

## REAL билет

Для каждого номинала:

- один клик «Новая игра» = ровно один PayTicket;
- повторный клик/двойной tap не создаёт второй билет;
- при успешном ответе появляется номер билета;
- бросок разрешается только после ответа LMS;
- `win` на экране = `win` LMS;
- конечный баланс = `balance` LMS.

## Ошибки

Проверить:

- insufficient funds;
- expired session;
- timeout;
- HTTP 500;
- неправильный JSON;
- неизвестный scenario;
- потерю сети.

При failed PayTicket ставка в UI должна откатиться.

## Сценарии

Прогнать минимум 20–50 билетов каждого сценария:

```text
ZERO
ONE
ONE_KHAN
TWO
TWO_KHAN
THREE
THREE_KHAN
FOUR
FOUR_KHAN
FIVE
FIVE_KHAN
```

Проверить соответствие визуального результата сценарию.

## AutoPlay

- 5 / 10 / 20 / 50;
- остановка AutoPlay;
- недостаточно средств в середине серии;
- session expired в середине серии;
- новый билет не начинается до окончания предыдущего раунда/поздравления.

## Mobile

Обязательно:

- iPhone Safari;
- Android Chrome;
- Telegram WebView;
- Instagram/WebView, если игра открывается оттуда;
- desktop Chrome/Edge.

Цель — стабильное отображение и отсутствие критичных падений FPS.

---

# 22. Что НЕ должен делать программист сайта

- не вычислять выигрыш из scenario на стороне сайта;
- не заменять `win`, пришедший LMS;
- не вычислять новый REAL balance как `старый - ставка + выигрыш`;
- не запускать бросок до получения билета;
- не показывать пользователю raw technical error codes;
- не принимать postMessage от произвольных origin;
- не оставлять production `mock:true`;
- не использовать wildcard origin в production без необходимости.

---

# 23. Итоговая ответственность компонентов

### LMS

- авторизация/сессия;
- валидность ставки;
- создание билета;
- выбор результата/scenario;
- денежный выигрыш;
- итоговый баланс;
- журнал/история билетов на сервере.

### Игра

- выбор номинала из разрешённых;
- визуальный бросок;
- визуализация scenario;
- отображение номера билета, выигрыша и баланса;
- DEMO;
- локальная история последних билетов;
- audio / UI / i18n / autoplay.

### Родительский сайт X2

- передача init/session/balance;
- iframe lifecycle;
- открытие пополнения;
- синхронизация внешнего UI по `ROUND_COMPLETE`;
- telemetry/logging технических событий;
- security/CORS/origin policies.
