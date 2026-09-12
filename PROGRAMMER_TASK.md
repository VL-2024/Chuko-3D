# ТЗ программисту — подключение ЧҮКӨ Modern 3D к X2 LOTO / LMS

## Результат задачи

Игра должна открываться из production сайта X2 LOTO и в REAL-режиме покупать билет через LMS, визуализировать полученный scenario и показывать точный `win`/`balance`, возвращённый LMS.

## Работы

### A. Hosting

- разместить всю папку игры на HTTPS static host;
- сохранить структуру assets;
- проверить MIME `.glb/.webp/.mp3/.js`;
- разрешить встраивание игры в iframe сайта X2;
- настроить CSP/frame-ancestors.

### B. Production config

В `lms-config.js`:

- `mock:false`;
- реальный LMS `gameId`;
- реальный `endpoints.newGame` на `Lotto.Users.cls` / PayTicket;
- правильный `mode`;
- `demoAllowed` по продуктовой политике;
- точные `parentOrigin` и `allowedParentOrigins`;
- согласовать `sessionMode` и `sessionHeader`.

### C. Parent iframe bridge

- слушать `X2_GAME_READY` только с game origin;
- отправлять `X2_LMS_INIT`;
- передавать session;
- передавать initial REAL balance;
- передавать currency/currencyDisplay/language/denominations;
- слушать `X2_GAME_ROUND_COMPLETE` и синхронизировать внешний баланс;
- обрабатывать `X2_GAME_DEPOSIT_REQUEST`;
- технические `X2_GAME_ERROR` отправлять в логи, не показывать raw игроку.

### D. LMS PayTicket

Поддержать запрос игры:

```text
GET <PayTicket URL>?Method=PayTicket&gameId=<id>&amount=<stake>
```

Ответ должен содержать:

```text
ticketId
scenario
win
balance
```

или поддерживаемые adapter алиасы, описанные в `LMS_API.md`.

### E. Security

- HTTPS;
- origin validation;
- без `'*'` в production postMessage/CORS, если нет специальной причины;
- корректная session/cookie policy;
- credentialed CORS;
- не логировать session в публичные frontend logs;
- query session использовать только если это согласовано отдельно.

### F. QA

Проверить:

- все номиналы;
- ZERO/ONE/ONE_KHAN/TWO/TWO_KHAN/THREE/THREE_KHAN/FOUR/FOUR_KHAN/FIVE/FIVE_KHAN;
- проверить отдельно варианты с ХАНОМ: 1+ХАН, 2+ХАН, 3+ХАН, 4+ХАН, 5+ХАН;
- баланс до/после;
- недостаток средств;
- timeout/session expired/network error;
- DEMO и REAL (если DEMO разрешён);
- AutoPlay 5/10/20/50;
- iPhone/Android/desktop/WebView;
- Deposit event;
- двойные клики/повторные запросы;
- один ticket request на один новый раунд.

## Definition of Done

Интеграция считается завершённой, когда:

1. REAL раунд невозможно начать без успешного PayTicket.
2. Каждый раунд имеет уникальный ticket ID LMS.
3. Scenario визуализируется игрой без пересчёта денежного результата.
4. `win` и итоговый `balance` на экране равны данным LMS.
5. Ошибка PayTicket не списывает деньги в UI и не оставляет игру в зависшем состоянии.
6. Сессия защищена и работает во всех целевых браузерах.
7. Родительский сайт корректно реагирует на Deposit и Round Complete.
8. Raw технические коды не показываются игроку.
9. В production отключён mock.
10. Выполнен mobile QA и подписан smoke-test по каждому scenario.
