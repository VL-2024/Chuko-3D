window.CHUKO3D_CONFIG = Object.freeze({
  version: '0.4',
  sourceMechanic: 'CHUKO v20.61',

  field: {
    radius: 3.35,
    thickness: 0.18,
    visualRadius: 3.42
  },

  // Кучка остаётся компактной: управление броском меняет точку контакта,
  // а не разбрасывает стартовую раскладку по всему полю.
  pile: {
    chukoCount: 12,
    offsetZ: -0.42,
    spreadX: 0.78,
    spreadZ: 0.54,
    positionJitter: 0.09,
    angleJitter: 0.42,
    stackLift: 0.16
  },

  pieces: {
    chuko: { width: 0.42, height: 0.30, depth: 0.72, mass: 0.11 },
    khan:  { width: 0.47, height: 0.33, depth: 0.79, mass: 0.15 },
    saka:  { width: 0.62, height: 0.43, depth: 0.88, mass: 0.68 }
  },

  physics: {
    gravity: -9.81,
    // v0.4: меньше сцепления с полем + более тяжёлая САКА.
    // Разлёт должен стать примерно в 1.5–2 раза выразительнее без сценарного "взрыва".
    friction: 0.30,
    restitution: 0.24,
    sakaFriction: 0.24,
    sakaRestitution: 0.28,
    fieldFriction: 0.42,
    fieldRestitution: 0.08,
    groundFriction: 0.50,
    groundRestitution: 0.05
  },

  throw: {
    start: { x: 0.05, y: 0.42, z: 4.45 },
    targetY: 0.30,

    // Реальная Havok-баллистика. Сильный pull даёт чуть более высокую/долгую дугу,
    // поэтому вертикальная составляющая удара также растёт.
    flightTimeMin: 1.14,
    flightTimeMax: 1.31,
    sideSpin: 14.8,
    settleMs: 3100,

    // Аналог v20.61: бросок ограничен сектором, который гарантированно пересекает кучку.
    aimRadius: 0.78,
    aimSafetyDeg: 2.0,
    landingPowerMin: 0.10,
    landingPowerExponent: 0.92,
    deviationMaxDeg: 4.5,
    maxPullPxMobile: 118,
    maxPullPxDesktop: 132,
    sakaPullWorld: 0.62,
    tapThresholdPx: 10,
    sakaTouchRadiusMobile: 74,
    sakaTouchRadiusDesktop: 58
  },

  camera: {
    alpha: Math.PI / 2,
    betaMobile: 1.00,
    betaDesktop: 0.96,
    radiusMobile: 8.25,
    radiusDesktop: 7.85,
    target: { x: 0, y: 0.18, z: -0.10 }
  },

  mobile: {
    maxDevicePixelRatio: 1.45,
    lowFpsThreshold: 47,
    lowFpsSeconds: 2.2,
    fallbackDevicePixelRatio: 1.0
  }
});
