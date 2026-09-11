# CHUKO Modern 3D v0.12.2 — LMS adapter contract

## Инициализация

Standalone QA использует `mock: true`. В production установить `mock: false`.

При `initMode: postMessage` родитель передаёт:

```js
{
  type: 'X2_LMS_INIT',
  session: '...',
  gameId: 'CHUKO',
  denomination: 25,
  denominations: [25,50,100],
  currency: 'KGS',
  currencyDisplay: 'сом',
  language: 'RU',
  mode: 'real',
  demoAllowed: true
}
```

## Баланс

`X2LMS.getBalance({currency})` ожидает числовой `balance`.

## Новый билет

`X2LMS.createTicket(...)` нормализует ответ LMS к форме:

```js
{
  ticketId: '...',
  scenario: 1,
  scenarioKey: 'ZERO',
  win: 0,
  balance: 1000,
  denomination: 25,
  currency: 'KGS',
  currencyDisplay: 'сом'
}
```

Игра не рассчитывает REAL-выигрыш. `win` и итоговый `balance` авторитетны со стороны LMS. Баланс из ответа нового билета хранится как pending и показывается только после завершения визуального раунда.

## События iframe

Игра отправляет `X2_GAME_READY`, `X2_GAME_BALANCE_LOADED`, `X2_GAME_DENOMINATION_CHANGED`, `X2_GAME_MODE_CHANGED`, `X2_GAME_TICKET_READY`, `X2_GAME_ROUND_COMPLETE`, `X2_GAME_ERROR`.
