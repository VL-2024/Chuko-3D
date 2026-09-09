(() => {
  'use strict';

  const C = window.CHUKO3D_CONFIG;
  const ui = {
    canvas: document.getElementById('renderCanvas'),
    throwBtn: document.getElementById('throwBtn'),
    resetBtn: document.getElementById('resetBtn'),
    fps: document.getElementById('fps'),
    frameMs: document.getElementById('frameMs'),
    bodyCount: document.getElementById('bodyCount'),
    renderScale: document.getElementById('renderScale'),
    badge: document.getElementById('physicsBadge'),
    hint: document.getElementById('hint'),
    aimPower: document.getElementById('aimPower'),
    fatal: document.getElementById('fatal'),
    fatalText: document.getElementById('fatalText')
  };

  let engine;
  let scene;
  let field;
  let saka = null;
  let sakaAggregate = null;
  let bodies = [];
  let thrown = false;
  let resetTimer = 0;
  let lowFpsStartedAt = 0;
  let adaptiveScaleApplied = false;
  let roundIndex = 0;
  let aimDots = [];
  let aimTarget = null;
  let aimDotMaterial = null;
  let aimState = { dragging: false, pointerId: null, power: 0, guideDir: null, tapCandidate: false, downX: 0, downY: 0 };

  function showFatal(error) {
    console.error(error);
    ui.fatal.hidden = false;
    ui.fatalText.textContent = String(error?.message || error || 'Unknown error');
    ui.throwBtn.disabled = true;
  }

  function isMobile() {
    return matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function configureRenderScale() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cappedDpr = Math.min(dpr, C.mobile.maxDevicePixelRatio);
    engine.setHardwareScalingLevel(1 / cappedDpr);
    ui.renderScale.textContent = `${cappedDpr.toFixed(2)}×`;
  }

  async function initPhysics() {
    if (typeof HavokPhysics !== 'function') throw new Error('HavokPhysics не загрузился. Проверьте доступ к CDN.');
    const hk = await HavokPhysics();
    const plugin = new BABYLON.HavokPlugin(true, hk);
    scene.enablePhysics(new BABYLON.Vector3(0, C.physics.gravity, 0), plugin);
    ui.badge.textContent = 'HAVOK · READY';
  }

  function material(name, color, roughness = 0.78, metallic = 0.0) {
    const m = new BABYLON.PBRMaterial(name, scene);
    m.albedoColor = color;
    m.roughness = roughness;
    m.metallic = metallic;
    return m;
  }

  function mergeParts(name, parts, mat) {
    const merged = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    merged.name = name;
    merged.material = mat;
    return merged;
  }

  // v0.3 proxy astragalus: no central box. The silhouette is built from a
  // compact ellipsoid + four large rounded lobes + two side ridges.
  // It is still procedural, but reads much closer to the 2D references from v20.61.
  function makeChukoBone(name, dims, mat, khan = false) {
    const parts = [];
    const seg = isMobile() ? 8 : 11;

    const addBlob = (suffix, x, y, z, sx, sy, sz, segments = seg) => {
      const m = BABYLON.MeshBuilder.CreateSphere(`${name}-${suffix}`, {
        diameter: 1,
        segments
      }, scene);
      m.position.set(x, y, z);
      m.scaling.set(sx, sy, sz);
      parts.push(m);
      return m;
    };

    // Soft central bridge.
    addBlob('core', 0, 0, 0,
      dims.width * 0.34,
      dims.height * 0.40,
      dims.depth * 0.43,
      isMobile() ? 9 : 12);

    // Four characteristic ends. Slight asymmetry prevents the object from
    // looking like a perfect toy bone and helps the convex hull tumble.
    const lx = dims.width * 0.19;
    const lz = dims.depth * 0.31;
    addBlob('fl', -lx,  dims.height * 0.015,  lz,
      dims.width * 0.34, dims.height * 0.52, dims.depth * 0.26);
    addBlob('fr',  lx, -dims.height * 0.010,  lz * 0.98,
      dims.width * 0.36, dims.height * 0.49, dims.depth * 0.25);
    addBlob('bl', -lx * 1.04, -dims.height * 0.020, -lz,
      dims.width * 0.35, dims.height * 0.48, dims.depth * 0.27);
    addBlob('br',  lx * 0.96, dims.height * 0.018, -lz * 1.02,
      dims.width * 0.33, dims.height * 0.51, dims.depth * 0.26);

    // Side ridges / knuckles make the waist less spherical.
    addBlob('ridge-l', -dims.width * 0.30, dims.height * 0.02, -dims.depth * 0.01,
      dims.width * 0.16, dims.height * 0.32, dims.depth * 0.20, isMobile() ? 7 : 9);
    addBlob('ridge-r',  dims.width * 0.30, -dims.height * 0.01, dims.depth * 0.02,
      dims.width * 0.15, dims.height * 0.30, dims.depth * 0.19, isMobile() ? 7 : 9);

    if (khan) {
      // Small raised crown gives KHAN a distinct silhouette even without
      // the final ornamental texture/model.
      addBlob('crown', 0, dims.height * 0.27, -dims.depth * 0.01,
        dims.width * 0.19, dims.height * 0.18, dims.depth * 0.22, isMobile() ? 7 : 9);
    }

    const merged = mergeParts(name, parts, mat);
    merged.convertToFlatShadedMesh();
    return merged;
  }

  function makeSakaBone(name, dims, mat) {
    const parts = [];
    const seg = isMobile() ? 9 : 12;

    const addBlob = (suffix, x, y, z, sx, sy, sz, segments = seg) => {
      const m = BABYLON.MeshBuilder.CreateSphere(`${name}-${suffix}`, {
        diameter: 1,
        segments
      }, scene);
      m.position.set(x, y, z);
      m.scaling.set(sx, sy, sz);
      parts.push(m);
    };

    addBlob('core', 0, 0, 0,
      dims.width * 0.37, dims.height * 0.42, dims.depth * 0.44, isMobile() ? 10 : 14);

    const x = dims.width * 0.20;
    const z = dims.depth * 0.31;
    addBlob('fl', -x, 0.00,  z,
      dims.width * 0.36, dims.height * 0.53, dims.depth * 0.27);
    addBlob('fr',  x, 0.01,  z * 0.98,
      dims.width * 0.37, dims.height * 0.51, dims.depth * 0.26);
    addBlob('bl', -x * 1.03, -0.01, -z,
      dims.width * 0.35, dims.height * 0.50, dims.depth * 0.28);
    addBlob('br',  x * 0.98, 0.01, -z * 1.01,
      dims.width * 0.36, dims.height * 0.52, dims.depth * 0.27);

    addBlob('side-l', -dims.width * 0.31, 0, 0,
      dims.width * 0.16, dims.height * 0.32, dims.depth * 0.21, isMobile() ? 7 : 9);
    addBlob('side-r',  dims.width * 0.31, 0, 0,
      dims.width * 0.16, dims.height * 0.31, dims.depth * 0.21, isMobile() ? 7 : 9);

    const merged = mergeParts(name, parts, mat);
    merged.convertToFlatShadedMesh();
    return merged;
  }

  function createEnvironment() {
    scene.clearColor = new BABYLON.Color4(0.025, 0.075, 0.095, 1);

    const camera = new BABYLON.ArcRotateCamera(
      'camera',
      C.camera.alpha,
      isMobile() ? C.camera.betaMobile : C.camera.betaDesktop,
      isMobile() ? C.camera.radiusMobile : C.camera.radiusDesktop,
      new BABYLON.Vector3(C.camera.target.x, C.camera.target.y, C.camera.target.z),
      scene
    );
    camera.lowerRadiusLimit = 7.0;
    camera.upperRadiusLimit = 10.0;
    camera.lowerBetaLimit = 0.72;
    camera.upperBetaLimit = 1.20;
    camera.inputs.clear();

    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 1.22;
    hemi.groundColor = new BABYLON.Color3(0.07, 0.08, 0.065);

    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.35, -1, 0.45), scene);
    sun.position = new BABYLON.Vector3(4, 8, -5);
    sun.intensity = 1.9;

    const shadowMapSize = isMobile() ? 512 : 1024;
    const shadows = new BABYLON.ShadowGenerator(shadowMapSize, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.002;
    scene.metadata = { shadows };

    const fieldMat = material('fieldMat', new BABYLON.Color3(0.34, 0.50, 0.28), 0.96, 0.0);
    field = BABYLON.MeshBuilder.CreateCylinder('field', {
      height: C.field.thickness,
      diameter: C.field.visualRadius * 2,
      tessellation: 64
    }, scene);
    field.position.y = -C.field.thickness / 2;
    field.material = fieldMat;
    field.receiveShadows = true;

    const fieldPhysicsMesh = BABYLON.MeshBuilder.CreateCylinder('field-physics', {
      height: C.field.thickness,
      diameter: C.field.radius * 2,
      tessellation: 48
    }, scene);
    fieldPhysicsMesh.position.copyFrom(field.position);
    fieldPhysicsMesh.isVisible = false;
    const fieldAggregate = new BABYLON.PhysicsAggregate(
      fieldPhysicsMesh,
      BABYLON.PhysicsShapeType.CYLINDER,
      { mass: 0, friction: C.physics.fieldFriction, restitution: C.physics.fieldRestitution },
      scene
    );
    bodies.push({ mesh: fieldPhysicsMesh, aggregate: fieldAggregate, permanent: true });

    // В v0.2 визуальный бортик ниже: разлёт лучше читается и край меньше похож на стену.
    const rimMat = material('rimMat', new BABYLON.Color3(0.61, 0.70, 0.38), 0.8, 0.05);
    const rim = BABYLON.MeshBuilder.CreateTorus('rim', {
      diameter: C.field.radius * 2 + 0.14,
      thickness: 0.075,
      tessellation: 64
    }, scene);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.025;
    rim.material = rimMat;
    rim.receiveShadows = true;

    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 25, height: 25 }, scene);
    ground.position.y = -0.22;
    const groundMat = material('groundMat', new BABYLON.Color3(0.08, 0.16, 0.13), 1.0, 0.0);
    ground.material = groundMat;
    ground.receiveShadows = true;

    const groundPhysicsMesh = BABYLON.MeshBuilder.CreateBox('ground-physics', { width: 25, depth: 25, height: 0.18 }, scene);
    groundPhysicsMesh.position.y = -0.31;
    groundPhysicsMesh.isVisible = false;
    const groundAggregate = new BABYLON.PhysicsAggregate(
      groundPhysicsMesh,
      BABYLON.PhysicsShapeType.BOX,
      { mass: 0, friction: C.physics.groundFriction, restitution: C.physics.groundRestitution },
      scene
    );
    bodies.push({ mesh: groundPhysicsMesh, aggregate: groundAggregate, permanent: true });
  }

  function addShadow(mesh) {
    const shadows = scene.metadata?.shadows;
    if (shadows && mesh) shadows.addShadowCaster(mesh, true);
  }

  function createPiece(name, dims, pos, color, isKhan = false, yaw = 0) {
    const mat = material(`${name}-mat`, color, isKhan ? 0.24 : 0.69, isKhan ? 0.78 : 0.03);
    if (isKhan) {
      mat.emissiveColor = new BABYLON.Color3(0.055, 0.028, 0.004);
    }
    const mesh = makeChukoBone(name, dims, mat, isKhan);
    mesh.position.copyFrom(pos);
    mesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
      (Math.random() - 0.5) * C.pile.angleJitter,
      yaw + (Math.random() - 0.5) * C.pile.angleJitter,
      (Math.random() - 0.5) * C.pile.angleJitter
    );
    addShadow(mesh);

    // v0.3: convex hull follows the irregular proxy silhouette much better than a box.
    const aggregate = new BABYLON.PhysicsAggregate(
      mesh,
      BABYLON.PhysicsShapeType.CONVEX_HULL,
      {
        mass: dims.mass,
        friction: C.physics.friction,
        restitution: C.physics.restitution
      },
      scene
    );
    bodies.push({ mesh, aggregate });
    return { mesh, aggregate };
  }

  function clearRoundBodies() {
    window.clearTimeout(resetTimer);
    resetTimer = 0;
    for (const item of bodies.filter(x => !x.permanent)) {
      try { item.aggregate?.dispose(); } catch (_) {}
      try { item.mesh?.dispose(false, true); } catch (_) {}
    }
    bodies = bodies.filter(x => x.permanent);
    saka = null;
    sakaAggregate = null;
  }

  function pilePositions() {
    // World-space analogue of the approved compact v20.61 4×3 layout.
    const sx = C.pile.spreadX;
    const sz = C.pile.spreadZ;
    return [
      [-0.86*sx,-0.56*sz],[-0.29*sx,-0.68*sz],[ 0.29*sx,-0.68*sz],[ 0.86*sx,-0.56*sz],
      [-1.02*sx,-0.03*sz],[-0.48*sx,-0.02*sz],[ 0.48*sx,-0.02*sz],[ 1.02*sx,-0.03*sz],
      [-0.86*sx, 0.50*sz],[-0.29*sx, 0.60*sz],[ 0.29*sx, 0.60*sz],[ 0.86*sx, 0.50*sz]
    ];
  }

  function resetRound() {
    clearRoundBodies();
    thrown = false;
    roundIndex++;
    ui.throwBtn.disabled = false;
    ui.throwBtn.textContent = 'БРОСИТЬ САКА';
    ui.hint.textContent = 'v0.4 · потяните синюю САКА назад и отпустите';
    ui.hint.style.opacity = '1';
    resetAimState();
    hideAimVisuals();
    if (ui.aimPower) ui.aimPower.hidden = true;

    const chukoColors = [
      new BABYLON.Color3(0.77,0.70,0.57),
      new BABYLON.Color3(0.66,0.60,0.48),
      new BABYLON.Color3(0.83,0.75,0.61)
    ];

    const positions = pilePositions();
    const d = C.pieces.chuko;
    positions.forEach(([px, pz], i) => {
      const jitter = C.pile.positionJitter;
      const x = px + (Math.random() - 0.5) * jitter * 2;
      const z = C.pile.offsetZ + pz + (Math.random() - 0.5) * jitter * 2;
      // Alternating directions make the pile look irregular without spawning overlaps.
      const yaw = (i % 2 ? 0.78 : -0.72) + (i % 4 - 1.5) * 0.10;
      const lift = (i % 5 === 0 || i % 7 === 0) ? C.pile.stackLift : 0;
      createPiece(
        `chuko-${i+1}`,
        d,
        new BABYLON.Vector3(x, d.height * 0.58 + lift, z),
        chukoColors[i % chukoColors.length],
        false,
        yaw
      );
    });

    // KHAN now lies in the empty centre of the 12-piece layout.
    const kd = C.pieces.khan;
    createPiece(
      'KHAN',
      kd,
      new BABYLON.Vector3(0.0, kd.height * 0.54, C.pile.offsetZ - 0.01),
      new BABYLON.Color3(0.12, 0.075, 0.025),
      true,
      0.58
    );

    const sd = C.pieces.saka;
    const sakaMat = material('saka-mat', new BABYLON.Color3(0.025, 0.22, 0.78), 0.22, 0.44);
    saka = makeSakaBone('SAKA', sd, sakaMat);
    saka.position.set(C.throw.start.x, C.throw.start.y, C.throw.start.z);
    saka.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0.18, -0.45, 0.12);
    addShadow(saka);

    // v0.3: SAKA also uses an irregular convex hull. With only 14 dynamic bodies
    // this should still be cheap enough; FPS panel remains our acceptance test.
    sakaAggregate = new BABYLON.PhysicsAggregate(
      saka,
      BABYLON.PhysicsShapeType.CONVEX_HULL,
      {
        mass: sd.mass,
        friction: C.physics.sakaFriction,
        restitution: C.physics.sakaRestitution
      },
      scene
    );
    bodies.push({ mesh: saka, aggregate: sakaAggregate });

    sakaAggregate.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
    updateBodyCount();
  }

  function ballisticVelocity(start, target, flightTime, gravityY) {
    const g = new BABYLON.Vector3(0, gravityY, 0);
    return target.subtract(start).subtract(g.scale(0.5 * flightTime * flightTime)).scale(1 / flightTime);
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, Number(v) || 0));
  }

  function normalize2(x, z, fallbackX = 0, fallbackZ = -1) {
    const len = Math.hypot(x, z);
    if (len < 1e-7) return { x: fallbackX, z: fallbackZ };
    return { x: x / len, z: z / len };
  }

  function rotate2(v, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: v.x * c - v.z * s, z: v.x * s + v.z * c };
  }

  function signedAngle2(a, b) {
    return Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
  }

  function rayCircleIntersections2(origin, dir, center, radius) {
    const ox = origin.x - center.x;
    const oz = origin.z - center.z;
    const b = 2 * (ox * dir.x + oz * dir.z);
    const c = ox * ox + oz * oz - radius * radius;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const sd = Math.sqrt(disc);
    const t1 = (-b - sd) / 2;
    const t2 = (-b + sd) / 2;
    const near = Math.min(t1, t2);
    const far = Math.max(t1, t2);
    if (far <= 0) return null;
    return { near: Math.max(0, near), far };
  }

  function aimGeometry() {
    const origin = { x: C.throw.start.x, z: C.throw.start.z };
    const center = { x: 0, z: C.pile.offsetZ };
    const radius = C.throw.aimRadius;
    const toCenter = normalize2(center.x - origin.x, center.z - origin.z);
    const distance = Math.hypot(center.x - origin.x, center.z - origin.z);
    const tangentHalfAngle = Math.asin(Math.max(0, Math.min(0.999, radius / Math.max(radius + 0.001, distance))));
    const safety = Math.max(0, Number(C.throw.aimSafetyDeg || 0)) * Math.PI / 180;
    return {
      origin,
      center,
      radius,
      toCenter,
      halfAngle: Math.max(2 * Math.PI / 180, tangentHalfAngle - safety)
    };
  }

  function clampThrowDirectionToPile(dir) {
    const geo = aimGeometry();
    const desired = normalize2(dir.x, dir.z, geo.toCenter.x, geo.toCenter.z);
    let angle = signedAngle2(geo.toCenter, desired);
    angle = Math.max(-geo.halfAngle, Math.min(geo.halfAngle, angle));
    return rotate2(geo.toCenter, angle);
  }

  function landingForDirectionAndPower(dir, power01) {
    const geo = aimGeometry();
    const safeDir = clampThrowDirectionToPile(dir);
    let hits = rayCircleIntersections2(geo.origin, safeDir, geo.center, geo.radius);
    if (!hits) hits = rayCircleIntersections2(geo.origin, geo.toCenter, geo.center, geo.radius);

    const minPower = Math.max(0, Math.min(0.45, Number(C.throw.landingPowerMin || 0.1)));
    const exponent = Math.max(0.35, Number(C.throw.landingPowerExponent || 1));
    const power = clamp01(power01);
    const mapped = minPower + (1 - minPower) * Math.pow(power, exponent);
    const t = hits.near + (hits.far - hits.near) * mapped;

    return {
      dir: safeDir,
      point: { x: geo.origin.x + safeDir.x * t, z: geo.origin.z + safeDir.z * t },
      power
    };
  }

  function actualThrowFromGuide(guideDir, power01) {
    const geo = aimGeometry();
    const guide = clampThrowDirectionToPile(guideDir);
    const guideAngle = signedAngle2(geo.toCenter, guide);
    const leftRoom = guideAngle + geo.halfAngle;
    const rightRoom = geo.halfAngle - guideAngle;
    const maxDev = Math.max(0, Math.min(12, Number(C.throw.deviationMaxDeg || 0))) * Math.PI / 180;

    let deviation = (Math.random() * 2 - 1) * maxDev;
    deviation = Math.max(-Math.min(maxDev, leftRoom), Math.min(Math.min(maxDev, rightRoom), deviation));
    const actualDir = rotate2(guide, deviation);
    const landing = landingForDirectionAndPower(actualDir, power01);
    return { ...landing, guideDir: guide, deviation };
  }

  function flightTimeForPower(power) {
    const p = clamp01(power);
    return C.throw.flightTimeMin + (C.throw.flightTimeMax - C.throw.flightTimeMin) * p;
  }

  function createAimVisuals() {
    aimDotMaterial = new BABYLON.StandardMaterial('aim-dot-mat', scene);
    aimDotMaterial.diffuseColor = new BABYLON.Color3(0.95, 0.98, 0.98);
    aimDotMaterial.emissiveColor = new BABYLON.Color3(0.32, 0.38, 0.40);
    aimDotMaterial.alpha = 0.86;

    for (let i = 0; i < 16; i++) {
      const dot = BABYLON.MeshBuilder.CreateSphere(`aim-dot-${i}`, {
        diameter: i === 15 ? 0.085 : 0.060,
        segments: 5
      }, scene);
      dot.material = aimDotMaterial;
      dot.isPickable = false;
      dot.setEnabled(false);
      aimDots.push(dot);
    }

    const targetMat = new BABYLON.StandardMaterial('aim-target-mat', scene);
    targetMat.diffuseColor = new BABYLON.Color3(0.90, 0.94, 0.20);
    targetMat.emissiveColor = new BABYLON.Color3(0.30, 0.34, 0.03);
    targetMat.alpha = 0.94;
    aimTarget = BABYLON.MeshBuilder.CreateTorus('aim-target', {
      diameter: 0.34,
      thickness: 0.035,
      tessellation: 24
    }, scene);
    aimTarget.material = targetMat;
    aimTarget.isPickable = false;
    aimTarget.setEnabled(false);
  }

  function hideAimVisuals() {
    aimDots.forEach(dot => dot.setEnabled(false));
    if (aimTarget) aimTarget.setEnabled(false);
  }

  function updateAimVisuals(target2, power) {
    if (!saka || !aimDots.length) return;
    const start = new BABYLON.Vector3(C.throw.start.x, C.throw.start.y, C.throw.start.z);
    const target = new BABYLON.Vector3(target2.x, C.throw.targetY, target2.z);
    const flightTime = flightTimeForPower(power);
    const v = ballisticVelocity(start, target, flightTime, C.physics.gravity);

    aimDots.forEach((dot, i) => {
      const t = flightTime * ((i + 1) / (aimDots.length + 1));
      const p = start.add(v.scale(t)).add(new BABYLON.Vector3(0, 0.5 * C.physics.gravity * t * t, 0));
      dot.position.copyFrom(p);
      dot.setEnabled(i % 2 === 0 || i === aimDots.length - 1);
    });

    if (aimTarget) {
      aimTarget.position.set(target2.x, 0.045, target2.z);
      aimTarget.scaling.setAll(0.86 + 0.20 * clamp01(power));
      aimTarget.setEnabled(true);
    }
  }

  function resetAimState() {
    aimState = { dragging: false, pointerId: null, power: 0, guideDir: null, tapCandidate: false, downX: 0, downY: 0 };
  }

  function canvasPointer(e) {
    const r = ui.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, width: r.width, height: r.height };
  }

  function sakaScreenPosition() {
    if (!saka || !scene?.activeCamera) return null;
    const viewport = scene.activeCamera.viewport.toGlobal(ui.canvas.clientWidth, ui.canvas.clientHeight);
    return BABYLON.Vector3.Project(saka.position, BABYLON.Matrix.Identity(), scene.getTransformMatrix(), viewport);
  }

  function isPointerNearSaka(e) {
    const p = canvasPointer(e);
    const sp = sakaScreenPosition();
    if (!sp) return false;
    const radius = isMobile() ? C.throw.sakaTouchRadiusMobile : C.throw.sakaTouchRadiusDesktop;
    return Math.hypot(p.x - sp.x, p.y - sp.y) <= radius;
  }

  function updateDragAim(e) {
    const dx = e.clientX - aimState.downX;
    const dy = e.clientY - aimState.downY;
    const pullLen = Math.hypot(dx, dy);
    const maxPull = isMobile() ? C.throw.maxPullPxMobile : C.throw.maxPullPxDesktop;
    const capped = Math.min(maxPull, pullLen);
    const power = clamp01(capped / maxPull);

    const rawDir = normalize2(-dx, -dy, 0, -1);
    const guideDir = clampThrowDirectionToPile(rawDir);
    const preview = landingForDirectionAndPower(guideDir, power);

    aimState.power = power;
    aimState.guideDir = guideDir;
    updateAimVisuals(preview.point, power);

    // Небольшой визуальный pull самой САКА, как в v20.61.
    // Physics body пока STATIC; перед реальным броском позиция возвращается точно в start.
    const pullWorld = C.throw.sakaPullWorld * power;
    saka.position.set(
      C.throw.start.x - guideDir.x * pullWorld,
      C.throw.start.y + 0.025 * power,
      C.throw.start.z - guideDir.z * pullWorld
    );

    if (ui.aimPower) {
      ui.aimPower.hidden = power < 0.02;
      const strong = ui.aimPower.querySelector('strong');
      if (strong) strong.textContent = `${Math.round(power * 100)}%`;
    }
    ui.hint.textContent = power < 0.08
      ? 'Тяните САКА назад сильнее'
      : 'Отпустите · пунктир показывает точку падения';
  }

  function bindAimControls() {
    ui.canvas.addEventListener('pointerdown', (e) => {
      if (thrown || !saka) return;
      const p = canvasPointer(e);
      aimState.tapCandidate = true;
      aimState.downX = e.clientX;
      aimState.downY = e.clientY;

      if (!isPointerNearSaka(e)) return;

      aimState.dragging = true;
      aimState.pointerId = e.pointerId;
      aimState.power = 0;
      aimState.guideDir = null;
      ui.canvas.setPointerCapture?.(e.pointerId);
      ui.hint.textContent = 'Тяните назад: влево/вправо — сторона удара, дальше — сила';
      e.preventDefault();
    });

    ui.canvas.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - aimState.downX, e.clientY - aimState.downY) > C.throw.tapThresholdPx) {
        aimState.tapCandidate = false;
      }
      if (!aimState.dragging || aimState.pointerId !== e.pointerId || thrown) return;
      updateDragAim(e);
      e.preventDefault();
    });

    const release = (e) => {
      if (aimState.dragging && aimState.pointerId === e.pointerId) {
        const power = aimState.power;
        const guideDir = aimState.guideDir;
        aimState.dragging = false;
        aimState.pointerId = null;
        aimState.tapCandidate = false;
        if (ui.aimPower) ui.aimPower.hidden = true;
        if (power < 0.06 || !guideDir) throwSaka();
        else throwSaka({ guideDir, power });
        e.preventDefault();
        return;
      }

      if (aimState.tapCandidate && !thrown) {
        const p = canvasPointer(e);
        aimState.tapCandidate = false;
        if (p.y < p.height * 0.82) throwSaka();
      }
    };

    ui.canvas.addEventListener('pointerup', release);
    ui.canvas.addEventListener('pointercancel', (e) => {
      if (aimState.dragging && aimState.pointerId === e.pointerId) {
        aimState.dragging = false;
        aimState.pointerId = null;
        saka?.position.set(C.throw.start.x, C.throw.start.y, C.throw.start.z);
        hideAimVisuals();
        if (ui.aimPower) ui.aimPower.hidden = true;
        ui.hint.textContent = 'v0.4 · потяните синюю САКА назад и отпустите';
      }
      aimState.tapCandidate = false;
    });
  }

  function throwSaka(options = {}) {
    if (thrown || !saka || !sakaAggregate) return;
    thrown = true;
    ui.throwBtn.disabled = true;
    ui.throwBtn.textContent = 'САКА В ПОЛЁТЕ…';
    if (ui.aimPower) ui.aimPower.hidden = true;
    hideAimVisuals();

    let guideDir;
    let power;
    if (options.guideDir) {
      guideDir = clampThrowDirectionToPile(options.guideDir);
      power = clamp01(options.power ?? 0.68);
    } else {
      const geo = aimGeometry();
      const a = (Math.random() * 2 - 1) * geo.halfAngle * 0.66;
      guideDir = rotate2(geo.toCenter, a);
      power = 0.48 + Math.random() * 0.34;
    }

    const actual = actualThrowFromGuide(guideDir, power);
    const target = new BABYLON.Vector3(actual.point.x, C.throw.targetY, actual.point.z);
    const start = new BABYLON.Vector3(C.throw.start.x, C.throw.start.y, C.throw.start.z);
    const flightTime = flightTimeForPower(power);

    ui.hint.textContent = `Удар ${Math.round(power * 100)}% · Havok: смотрим дальность разлёта`;

    saka.position.copyFrom(start);
    sakaAggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
    sakaAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
    sakaAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());

    const v = ballisticVelocity(start, target, flightTime, C.physics.gravity);
    sakaAggregate.body.setLinearVelocity(v);
    const spin = C.throw.sideSpin * (0.82 + power * 0.36);
    sakaAggregate.body.setAngularVelocity(new BABYLON.Vector3(
      -spin * 0.60,
      spin * 0.24,
      spin
    ));

    resetTimer = window.setTimeout(() => {
      ui.throwBtn.disabled = false;
      ui.throwBtn.textContent = 'ЕЩЁ БРОСОК';
      ui.hint.textContent = 'Разлёт усилен · «Ещё бросок» соберёт кучку заново';
    }, C.throw.settleMs);
  }

  function updateBodyCount() {
    ui.bodyCount.textContent = String(bodies.length);
  }

  function updatePerf() {
    const fps = engine.getFps();
    const frame = 1000 / Math.max(1, fps);
    ui.fps.textContent = Math.round(fps).toString();
    ui.frameMs.textContent = `${frame.toFixed(1)} ms`;

    if (!isMobile() || adaptiveScaleApplied) return;
    if (fps < C.mobile.lowFpsThreshold) {
      if (!lowFpsStartedAt) lowFpsStartedAt = performance.now();
      const elapsed = (performance.now() - lowFpsStartedAt) / 1000;
      if (elapsed >= C.mobile.lowFpsSeconds) {
        engine.setHardwareScalingLevel(1 / C.mobile.fallbackDevicePixelRatio);
        ui.renderScale.textContent = `${C.mobile.fallbackDevicePixelRatio.toFixed(2)}× auto`;
        adaptiveScaleApplied = true;
      }
    } else {
      lowFpsStartedAt = 0;
    }
  }

  async function boot() {
    if (!window.BABYLON) throw new Error('Babylon.js не загрузился. Проверьте доступ к CDN.');

    engine = new BABYLON.Engine(ui.canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      disableWebGL2Support: false,
      antialias: true,
      powerPreference: 'high-performance'
    });
    configureRenderScale();

    scene = new BABYLON.Scene(engine);
    scene.skipPointerMovePicking = true;
    scene.performancePriority = BABYLON.ScenePerformancePriority.Intermediate;

    await initPhysics();
    createEnvironment();
    createAimVisuals();
    resetRound();

    scene.onBeforeRenderObservable.add(() => {
      if (saka && saka.position.y < -2.5) {
        sakaAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
        sakaAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
        sakaAggregate.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
      }
    });

    let perfTick = 0;
    engine.runRenderLoop(() => {
      scene.render();
      perfTick++;
      if (perfTick % 12 === 0) updatePerf();
    });

    window.addEventListener('resize', () => engine.resize(), { passive: true });
    ui.throwBtn.addEventListener('click', () => {
      if (!thrown) throwSaka();
      else resetRound();
    });
    ui.resetBtn.addEventListener('click', resetRound);
    bindAimControls();

    updatePerf();
  }

  boot().catch(showFatal);
})();
