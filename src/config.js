window.CHUKO3D_CONFIG = Object.freeze({
  version: '0.8.19',
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
    offsetZ: -0.24,
    spreadX: 0.60,
    spreadZ: 0.44,
    positionJitter: 0.06,
    angleJitter: 0.42,
    stackLift: 0.13
  },

  pieces: {
    chuko: { width: 0.39, height: 0.26, depth: 0.60, mass: 0.085 },
    khan:  { width: 0.43, height: 0.29, depth: 0.66, mass: 0.12 },
    saka:  { width: 0.58, height: 0.40, depth: 0.80, mass: 0.70 }
  },


  visual: {
    organicRingsMobile: 8,
    organicRingsDesktop: 11,
    organicSegmentsMobile: 14,
    organicSegmentsDesktop: 18,
    toneExposure: 1.08,
    toneContrast: 1.10,
    fieldInnerRadius: 3.14,
    fieldInnerLift: 0.012
  },


  environment: {
    ornamentCount: 18,
    mountainLayers: 3,
    skyTextureSize: 256,
    fogStart: 8.5,
    fogEnd: 18.0
  },

  physics: {
    gravity: -9.81,
    // v0.5: ещё меньше сцепления с полем + более тяжёлая САКА.
    // Базовый Havok-разлёт усилен, а точечный contact boost добавляет энергию в момент удара.
    friction: 0.24,
    restitution: 0.22,
    sakaFriction: 0.20,
    sakaRestitution: 0.26,
    fieldFriction: 0.52,
    fieldRestitution: 0.08,
    groundFriction: 0.72,
    groundRestitution: 0.05
  },

  throw: {
    start: { x: 0.72, y: 0.70, z: 2.85 },
    targetY: 0.30,
    contactAimY: 0.34,
    finalApproachStartY: 0.98,
    finalApproachMinTime: 0.035,
    finalApproachMaxSpeed: 7.4,
    pileReleaseY: 0.58,
    pileReleaseHorizontalError: 0.14,

    // v0.5: дуга задаётся через реальную высоту апекса.
    // Это делает полёт визуально стабильнее: САКА действительно поднимается
    // над полем и затем падает сверху точно в выбранную точку.
    arcHeightMin: 1.55,
    arcHeightMax: 2.05,
    sideSpin: 15.4,
    settleMs: 3400,

    // Контактный импульс не задаёт результат сценария — он лишь усиливает
    // энергию реального удара Havok в ближайшей зоне, как impactBoost в v20.61.
    impactBoost: {
      enabled: true,
      triggerHeight: 0.72,
      triggerRadius: 0.56,
      affectRadius: 0.90,
      radialSpeed: 1.88,
      forwardSpeed: 0.46,
      liftSpeed: 0.38,
      randomSpeed: 0.14,
      khanFactor: 0.86
    },

    // Аналог v20.61: бросок ограничен сектором, который гарантированно пересекает кучку.
    aimRadius: 0.78,
    aimSafetyDeg: 2.0,
    landingPowerMin: 0.10,
    landingPowerExponent: 0.92,
    deviationMaxDeg: 4.5,
    manualDeviationMaxDeg: 0.0,
    aimPointRadiusFactor: 0.92,
    aimHorizontalSensitivity: 1.06,
    aimDepthSensitivity: 1.00,
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
    radiusMobile: 8.45,
    radiusDesktop: 8.00,
    target: { x: 0, y: 0.16, z: 0.04 }
  },

  mobile: {
    maxDevicePixelRatio: 1.45,
    lowFpsThreshold: 47,
    lowFpsSeconds: 2.2,
    fallbackDevicePixelRatio: 1.0
  }
});
