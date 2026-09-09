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
      { mass: 0, friction: 0.78, restitution: 0.10 },
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
      { mass: 0, friction: 0.82, restitution: 0.06 },
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
    ui.hint.textContent = 'v0.3 · convex hull: смотрим кувырки, разлёт и FPS';
    ui.hint.style.opacity = '1';

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

  function throwSaka() {
    if (thrown || !saka || !sakaAggregate) return;
    thrown = true;
    ui.throwBtn.disabled = true;
    ui.throwBtn.textContent = 'САКА В ПОЛЁТЕ…';
    ui.hint.textContent = 'Havok convex hull: САКА падает сверху и цепляет реальную форму чүкө';

    const jitter = C.throw.targetJitter;
    const target = new BABYLON.Vector3(
      (Math.random() - 0.5) * jitter * 2,
      C.throw.targetY,
      C.pile.offsetZ + (Math.random() - 0.5) * jitter * 0.75
    );
    const start = new BABYLON.Vector3(C.throw.start.x, C.throw.start.y, C.throw.start.z);

    sakaAggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
    saka.position.copyFrom(start);
    sakaAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
    sakaAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());

    const v = ballisticVelocity(start, target, C.throw.flightTime, C.physics.gravity);
    sakaAggregate.body.setLinearVelocity(v);
    sakaAggregate.body.setAngularVelocity(new BABYLON.Vector3(
      -C.throw.sideSpin * 0.60,
      C.throw.sideSpin * 0.24,
      C.throw.sideSpin
    ));

    resetTimer = window.setTimeout(() => {
      ui.throwBtn.disabled = false;
      ui.throwBtn.textContent = 'ЕЩЁ БРОСОК';
      ui.hint.textContent = 'Ещё бросок соберёт тестовую кучку заново';
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

    ui.canvas.addEventListener('pointerup', (event) => {
      if (event.clientY < innerHeight * 0.78 && !thrown) throwSaka();
    }, { passive: true });

    updatePerf();
  }

  boot().catch(showFatal);
})();
