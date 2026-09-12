// Translation table: one row per text key, one column per language.
// To add a language: add its code to LANGS and a column to every row below.
// To add a UI string: add one row here, then reference it in index.html via
// data-i18n="key" or in game.js via tr('key').
//
// Falls back to RU (then to the raw key) if a cell is left blank for a
// language - so a new language column can be filled in gradually without
// ever showing a blank label in the meantime.
//
// NOTE on game-specific terms (ЧҮКӨ / САКА / ХАН): these are the actual
// names of the pieces in the traditional game, not generic words. EN/ZH
// columns below keep them as transliterations rather than "translating"
// them - please have a native speaker / the operator confirm this is the
// terminology they want before shipping EN/ZH to real players.
const LANGS = ['RU', 'EN', 'KG', 'ZH'];

const TABLE = {
  balance:          { RU:'Баланс',                    EN:'Balance',                      KG:'Баланс',                       ZH:'余额' },
  title:            { RU:'ЧҮКӨ',                       EN:'CHUKO',                        KG:'ЧҮКӨ',                         ZH:'CHUKO' },
  subtitle:         { RU:'Выбей Хана',                  EN:'Knock Out the Khan',           KG:'Ханды жык',                    ZH:'击败可汗' },

  newGame:          { RU:'Новая игра',                 EN:'New Game',                     KG:'Жаңы оюн',                     ZH:'新游戏' },
  makeThrow:        { RU:'Сделать бросок',              EN:'Throw',                        KG:'Ыргытуу',                      ZH:'投掷' },
  throwing:         { RU:'Бросок...',                  EN:'Throwing...',                  KG:'Ыргытуу...',                   ZH:'投掷中...' },
  loading:          { RU:'Загрузка...',                EN:'Loading...',                   KG:'Жүктөлүүдө...',                ZH:'加载中...' },
  retry:            { RU:'Повторить',                  EN:'Retry',                        KG:'Кайталоо',                     ZH:'重试' },

  autoPlay:         { RU:'Автоигра',                   EN:'Auto Play',                    KG:'Автооюн',                      ZH:'自动游戏' },
  autoStart:        { RU:'Старт',                      EN:'Start',                        KG:'Старт',                        ZH:'开始' },
  autoStop:         { RU:'Стоп',                       EN:'Stop',                         KG:'Токтот',                       ZH:'停止' },
  autoStopping:     { RU:'Стоп...',                    EN:'Stopping...',                  KG:'Токтотуу...',                  ZH:'正在停止...' },
  autoGames:        { RU:'Количество игр',              EN:'Number of games',              KG:'Оюндун саны',                  ZH:'游戏局数' },

  knocked:          { RU:'ВЫБИТО',                     EN:'KNOCKED OUT',                  KG:'ЧЫКТЫ',                        ZH:'击出' },
  scoreWin:         { RU:'ВЫИГРЫШ',                    EN:'WIN',                          KG:'УТУШ',                         ZH:'奖金' },
  khan:             { RU:'ХАН',                        EN:'KHAN',                         KG:'ХАН',                          ZH:'可汗' },
  stood:            { RU:'УСТОЯЛ',                     EN:'STAYED IN',                    KG:'КАЛДЫ',                        ZH:'未击出' },

  info:             { RU:'Инфо',                       EN:'Info',                         KG:'Инфо',                         ZH:'信息' },
  payoutTable:      { RU:'Таблица выплат',              EN:'Payout Table',                 KG:'Төлөмдөр таблицасы',           ZH:'赔付表' },
  howToPlay:        { RU:'Как играть',                 EN:'How to Play',                  KG:'Кантип ойноо керек',           ZH:'游戏玩法' },
  myTickets:        { RU:'Мои билеты',                 EN:'My Tickets',                   KG:'Менин билеттерим',             ZH:'我的彩票' },
  sound:            { RU:'Звук',                       EN:'Sound',                        KG:'Үн',                           ZH:'声音' },
  music:            { RU:'Музыка',                     EN:'Music',                        KG:'Музыка',                       ZH:'音乐' },
  ticket:           { RU:'Билет',                      EN:'Ticket',                       KG:'Билет',                        ZH:'彩票' },

  recentTickets:    { RU:'Последние билеты',            EN:'Recent Tickets',               KG:'Акыркы билеттер',              ZH:'最近的彩票' },
  noRecentTickets:  { RU:'Пока нет завершённых билетов', EN:'No completed tickets yet',     KG:'Азырынча аяктаган билеттер жок', ZH:'暂无已完成的彩票' },
  win:              { RU:'Выигрыш',                    EN:'Win',                          KG:'Утуш',                         ZH:'获奖' },

  real:             { RU:'REAL',                       EN:'REAL',                         KG:'REAL',                         ZH:'REAL' },
  demo:             { RU:'DEMO',                       EN:'DEMO',                         KG:'DEMO',                         ZH:'DEMO' },
  insufficient:     { RU:'Недостаточно средств',        EN:'Insufficient funds',           KG:'Каражат жетишсиз',             ZH:'余额不足' },
  sessionEnded:     { RU:'Сессия завершена',            EN:'Session ended',                KG:'Сессия аяктады',               ZH:'会话已结束' },
  startError:       { RU:'Не удалось начать игру',      EN:'Failed to start game',         KG:'Оюн башталган жок',            ZH:'游戏启动失败' },
  balanceError:     { RU:'Ошибка загрузки баланса',      EN:'Failed to load balance',       KG:'Баланс жүктөлгөн жок',         ZH:'余额加载失败' },

  helpTitle:        { RU:'Как играть',                 EN:'How to Play',                  KG:'Кантип ойноо керек',           ZH:'游戏玩法' },
  helpPull:         { RU:'Потяни САКА вниз и отпусти — или нажми «Сделать бросок».',
                      EN:'Pull SAKA back and release - or tap "Throw".',
                      KG:'САКАНЫ ылдый тартып коё бер — же «Ыргытуу» баскычын бас.',
                      ZH:'向后拉动萨卡（SAKA）并松开——或点击"投掷"。' },
  helpScenario:     { RU:'САКА ударит по чүкө. Результат билета уже определён LMS, игра только показывает его.',
                      EN:'SAKA will hit the chuko. The ticket result is already determined by the LMS - the game only displays it.',
                      KG:'САКА чүкөлөргө урунат. Билеттин жыйынтыгын LMS алдын ала аныктайт, оюн аны гана көрсөтөт.',
                      ZH:'萨卡将击中恰阔骨（chuko）。彩票结果已由LMS系统预先确定，游戏只是将其展示出来。' },
  helpMultiplier:   { RU:'Выбитые чүкө дают множитель — таблица выплат открывается кнопкой «Инфо».',
                      EN:'Knocked-out chuko give a multiplier - open the payout table with the "Info" button.',
                      KG:'Чыккан чүкөлөр көбөйткүч берет — таблица «Инфо» баскычы менен ачылат.',
                      ZH:'被击出的恰阔骨会带来倍数加成——点击"信息"按钮查看赔付表。' },
  helpKhan:         { RU:'Если вместе с чүкө выбит ХАН, выигрыш дополнительно умножается на ×5.',
                      EN:'If KHAN is knocked out together with the chuko, the win is additionally multiplied by ×5.',
                      KG:'Эгер чүкөлөр менен кошо ХАН чыкса, утуш дагы ×5ке көбөйөт.',
                      ZH:'如果可汗与恰阔骨一起被击出，奖金将额外乘以×5。' },
  helpOk:           { RU:'Понятно',                    EN:'Got it',                       KG:'Түшүнүктүү',                   ZH:'知道了' },

  // In-canvas gameplay hint bar (see ui.hint in game.js). {placeholders}
  // are substituted with trf() - see below.
  hintChooseDenom:  { RU:'Выберите номинал и нажмите «Новая игра»',
                      EN:'Choose a stake and tap "New Game"',
                      KG:'Коюмду тандап, «Жаңы оюн» баскычын басыңыз',
                      ZH:'选择投注额并点击"新游戏"' },
  hintReady:        { RU:'{amount} · потяните САКА',
                      EN:'{amount} · pull SAKA',
                      KG:'{amount} · САКАНЫ тартыңыз',
                      ZH:'{amount} · 拉动萨卡' },
  hintPressNewGame: { RU:'Нажмите «Новая игра»',
                      EN:'Tap "New Game"',
                      KG:'«Жаңы оюн» баскычын басыңыз',
                      ZH:'点击"新游戏"' },
  hintPullHarder:   { RU:'Тяните САКА назад сильнее',
                      EN:'Pull SAKA back harder',
                      KG:'САКАНЫ дагы катуу тартыңыз',
                      ZH:'再用力向后拉动萨卡' },
  hintRelease:      { RU:'Отпустите · влево пальцем = прицел вправо',
                      EN:'Release · finger left = aim right',
                      KG:'Коё бериңиз · манжаны солго = прицел оңго',
                      ZH:'松开 · 手指左移=瞄准右移' },
  hintDragStart:    { RU:'Тяните назад: влево пальцем → прицел вправо · дальше — сила',
                      EN:'Pull back: finger left → aim right · farther = more power',
                      KG:'Артка тартыңыз: манжаны солго → прицел оңго · алыс — күч',
                      ZH:'向后拉：手指左移→瞄准右移·拉得越远力度越大' },
  hintImpactWait:   { RU:'Удар {power}% · ждём контакт и разлёт',
                      EN:'Power {power}% · waiting for contact',
                      KG:'Күч {power}% · байланышты күтүүдө',
                      ZH:'力度{power}% · 等待碰撞' },
  hintResultLocked: { RU:'Результат зафиксирован · нажмите «Новая игра»',
                      EN:'Result locked in · tap "New Game"',
                      KG:'Жыйынтык катталды · «Жаңы оюн» басыңыз',
                      ZH:'结果已确定 · 点击"新游戏"' },
  hintContactAffected: { RU:'Контакт · затронуто {n} чүкө',
                      EN:'Contact · {n} chuko affected',
                      KG:'Байланыш · {n} чүкө козголду',
                      ZH:'碰撞 · 影响了{n}个恰阔骨' },
  hintContactHavok: { RU:'Контакт · Havok',
                      EN:'Contact · Havok',
                      KG:'Байланыш · Havok',
                      ZH:'碰撞 · Havok' }
};

window.CHUKO_I18N = LANGS.reduce((dict, lang) => {
  dict[lang] = {};
  Object.keys(TABLE).forEach(key => {
    const row = TABLE[key];
    dict[lang][key] = row[lang] || row.RU || key;
  });
  return dict;
}, {});
