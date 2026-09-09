window.CHUKO3D_CONFIG = Object.freeze({
  version: '0.3',
  sourceMechanic: 'CHUKO v20.61',

  field: {
    radius: 3.35,
    thickness: 0.18,
    visualRadius: 3.42
  },

  // v0.3: кучка стала объёмнее и менее 'разложенной по сетке'.
  // ХАН остаётся внутри, но чүкө получают небольшую высоту/наклон и оседают Havok-ом.
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
    // Пропорции всё ещё proxy, но силуэт теперь ближе к реальному альчику.
    // В v0.3 BOX/SPHERE collision заменён на CONVEX_HULL для более естественного кувыркания.
    chuko: { width: 0.42, height: 0.30, depth: 0.72, mass: 0.13 },
    khan:  { width: 0.47, height: 0.33, depth: 0.79, mass: 0.17 },
    saka:  { width: 0.62, height: 0.43, depth: 0.88, mass: 0.50 }
  },

  physics: {
    gravity: -9.81,
    // Чуть меньше сцепления и отскока, чем в v0.1: удар жёстче,
    // чүкө легче переворачиваются и не превращаются в резиновые бруски.
    friction: 0.50,
    restitution: 0.20,
    sakaFriction: 0.34,
    sakaRestitution: 0.25
  },

  throw: {
    // Как в v20.61: САКА стартует со стороны игрока, поднимается над полем,
    // затем приходит в кучку сверху. Havok рассчитывает всю дугу сам.
    start: { x: 0.05, y: 0.42, z: 4.45 },
    targetY: 0.30,
    flightTime: 1.12,
    targetJitter: 0.16,
    sideSpin: 13.6,
    settleMs: 2850
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
