window.CHUKO3D_CONFIG = Object.freeze({
  version: '0.2',
  sourceMechanic: 'CHUKO v20.61',

  field: {
    radius: 3.35,
    thickness: 0.18,
    visualRadius: 3.42
  },

  // v0.2: кучка ближе к композиции v20.61 — компактные 3 ряда,
  // ХАН лежит в центре, а не появляется отдельно за кучей.
  pile: {
    chukoCount: 12,
    offsetZ: -0.42,
    spreadX: 0.88,
    spreadZ: 0.62,
    positionJitter: 0.055,
    angleJitter: 0.24
  },

  pieces: {
    // Визуальная геометрия стала похожа на кость, но collision shape пока
    // намеренно остаётся простой и быстрой для мобильного Havok.
    chuko: { width: 0.34, height: 0.25, depth: 0.74, mass: 0.13 },
    khan:  { width: 0.39, height: 0.29, depth: 0.82, mass: 0.17 },
    saka:  { width: 0.56, height: 0.39, depth: 0.84, physicsDiameter: 0.60, mass: 0.48 }
  },

  physics: {
    gravity: -9.81,
    // Чуть меньше сцепления и отскока, чем в v0.1: удар жёстче,
    // чүкө легче переворачиваются и не превращаются в резиновые бруски.
    friction: 0.54,
    restitution: 0.24,
    sakaFriction: 0.38,
    sakaRestitution: 0.29
  },

  throw: {
    // Как в v20.61: САКА стартует со стороны игрока, поднимается над полем,
    // затем приходит в кучку сверху. Havok рассчитывает всю дугу сам.
    start: { x: 0.05, y: 0.42, z: 4.45 },
    targetY: 0.30,
    flightTime: 1.12,
    targetJitter: 0.20,
    sideSpin: 12.8,
    settleMs: 2650
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
