/* CHUKO Modern 3D v0.13.0 — runtime / LMS settings. */
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

  // Автоигра.
  autoPlayCounts: [5, 10, 20, 50],
  autoPlayThrowDelayMs: 450,
  autoPlayNextRoundDelayMs: 900,

  // Аудио. Пользователь переключает звук/музыку в нижней панели.
  audio: {
    soundEnabled: true,
    musicEnabled: false,
    soundVolume: 0.22,
    musicVolume: 0.20,
    musicTracks: [
      'assets/music/mountain-sunset.mp3',
      'assets/music/nomads-sunset.mp3'
    ],
    voiceTags: [
      'assets/voice/x2-voice-01.mp3',
      'assets/voice/x2-voice-02.mp3'
    ],
    voiceVolume: 0.12,
    voiceMinDelayMs: 28000,
    voiceMaxDelayMs: 45000,
    musicDuckFactor: 0.68,
    soundFiles: {
      throw: 'assets/sounds/throw-whoosh.mp3',
      impact: 'assets/sounds/impact-chuko.mp3',
      khanImpact: 'assets/sounds/impact-khan.mp3',
      win: 'assets/sounds/win-accent.mp3'
    },
    effectFileVolume: 0.42
  },

  // Сколько последних завершённых билетов хранить локально в игре.
  // Полная история остаётся в личном кабинете LMS.
  localTicketHistoryLimit: 5,

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
