window.CHUKO3D_CONFIG = Object.freeze({
  version: '0.1',
  sourceMechanic: 'CHUKO v20.61',

  field: {
    radius: 3.35,
    thickness: 0.18,
    visualRadius: 3.42
  },

  pile: {
    chukoCount: 12,
    offsetZ: -0.30,
    spreadRadius: 0.82
  },

  pieces: {
    chuko: { width: 0.26, height: 0.25, depth: 0.78, mass: 0.14 },
    khan:  { width: 0.32, height: 0.31, depth: 0.90, mass: 0.18 },
    saka:  { diameter: 0.58, mass: 0.42 }
  },

  physics: {
    gravity: -9.81,
    friction: 0.66,
    restitution: 0.36,
    sakaFriction: 0.44,
    sakaRestitution: 0.42
  },

  throw: {
    start: { x: 0.0, y: 0.50, z: 4.65 },
    targetY: 0.38,
    flightTime: 0.88,
    targetJitter: 0.34,
    sideSpin: 10.5,
    settleMs: 2400
  },

  mobile: {
    maxDevicePixelRatio: 1.45,
    lowFpsThreshold: 47,
    lowFpsSeconds: 2.2,
    fallbackDevicePixelRatio: 1.0
  }
});
