/* CHUKO Modern 3D v0.11.0 — runtime / LMS settings. */
window.X2_GAME_CONFIG = {
  gameId: 'CHUKO',
  denomination: 25,
  denominations: [25, 50, 100],
  language: 'RU',
  currency: 'KGS',
  currencyDisplay: 'сом',
  mode: 'demo',
  demoAllowed: true,
  demoBalance: 10000,

  // GitHub / standalone QA. Production LMS must set this to false.
  mock: true,

  apiBase: '',
  endpoints: {
    balance: '/api/lms/player/balance',
    newGame: '/api/lms/game/new'
  },

  initMode: 'postMessage',
  sessionMode: 'postMessage',
  sessionQueryParam: 'session',
  sessionHeader: 'X-Session-ID',
  parentOrigin: '*',
  allowedParentOrigins: ['*'],
  requestTimeoutMs: 10000
};
