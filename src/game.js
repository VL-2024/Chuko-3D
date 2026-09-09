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

  function makeRoundedBone(name, dims, mat) {
    // Simple prototype geometry: a stretched bevelled box made from a box + two low-poly caps.
    const root = new BABYLON.TransformNode(`${name}-root`, scene);
    const core = BABYLON.MeshBuilder.CreateBox(`${name}-core`, {
      width: dims.width,
      height: dims.height,
      depth: dims.depth * 0.72
    }, scene);
    core.parent = root;
    core.material = mat;

    const capA = BABYLON.MeshBuilder.CreateSphere(`${name}-cap-a`, { diameter: 1, segments: 6 }, scene);
    capA.scaling.set(dims.width * 0.52, dims.height * 0.52, dims.depth * 0.20);
    capA.position.z = dims.depth * 0.36;
    capA.parent = root;
    capA.material = mat;

    const capB = capA.clone(`${name}-cap-b`);
    capB.position.z = -dims.depth * 0.36;
    capB.parent = root;

    const merged = BABYLON.Mesh.MergeMeshes([core, capA, capB], true, true, undefined, false, true);
    merged.name = name;
    root.dispose();
    merged.material = mat;
    return merged;
  }

  function createEnvironment() {
    scene.clearColor = new BABYLON.Color4(0.025, 0.075, 0.095, 1);

    const camera = new BABYLON.ArcRotateCamera(
      'camera',
      Math.PI / 2,
      isMobile() ? 1.06 : 1.00,
      isMobile() ? 8.9 : 8.2,
      new BABYLON.Vector3(0, 0.2, 0.15),
      scene
    );
    camera.lowerRadiusLimit = 7.2;
    camera.upperRadiusLimit = 10.5;
    camera.lowerBetaLimit = 0.72;
    camera.upperBetaLimit = 1.25;
    camera.inputs.clear();

    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 1.25;
    hemi.groundColor = new BABYLON.Color3(0.07, 0.08, 0.065);

    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.35, -1, 0.45), scene);
    sun.position = new BABYLON.Vector3(4, 8, -5);
    sun.intensity = 2.0;

    const shadowMapSize = isMobile() ? 512 : 1024;
    const shadows = new BABYLON.ShadowGenerator(shadowMapSize, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.002;
    scene.metadata = { shadows };

    const fieldMat = material('fieldMat', new BABYLON.Color3(0.32, 0.49, 0.26), 0.95, 0.0);
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
      { mass: 0, friction: 0.85, restitution: 0.18 },
      scene
    );
    bodies.push({ mesh: fieldPhysicsMesh, aggregate: fieldAggregate, permanent: true });

    // Low rim catches most prototype pieces while still allowing energetic ejections.
    const rimMat = material('rimMat', new BABYLON.Color3(0.61, 0.70, 0.38), 0.8, 0.05);
    const rim = BABYLON.MeshBuilder.CreateTorus('rim', {
      diameter: C.field.radius * 2 + 0.16,
      thickness: 0.10,
      tessellation: 64
    }, scene);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.055;
    rim.material = rimMat;
    rim.receiveShadows = true;

    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 25, height: 25 }, scene);
    ground.position.y = -0.22;
    const groundMat = material('groundMat', new BABYLON.Color3(0.08, 0.16, 0.13), 1.0, 0.0);
    ground.material = groundMat;
    ground.receiveShadows = true;

    // Use a real thin box for physics instead of a zero-thickness Ground mesh.
    const groundPhysicsMesh = BABYLON.MeshBuilder.CreateBox('ground-physics', { width: 25, depth: 25, height: 0.18 }, scene);
    groundPhysicsMesh.position.y = -0.31;
    groundPhysicsMesh.isVisible = false;
    const groundAggregate = new BABYLON.PhysicsAggregate(
      groundPhysicsMesh,
      BABYLON.PhysicsShapeType.BOX,
      { mass: 0, friction: 0.85, restitution: 0.1 },
      scene
    );
    bodies.push({ mesh: groundPhysicsMesh, aggregate: groundAggregate, permanent: true });
  }

  function addShadow(mesh) {
    const shadows = scene.metadata?.shadows;
    if (shadows && mesh) shadows.addShadowCaster(mesh, true);
  }

  function createPiece(name, dims, pos, color, isKhan = false) {
    const mat = material(`${name}-mat`, color, isKhan ? 0.42 : 0.72, isKhan ? 0.46 : 0.05);
    const mesh = makeRoundedBone(name, dims, mat);
    mesh.position.copyFrom(pos);
    mesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
      (Math.random() - 0.5) * 0.18,
      Math.random() * Math.PI,
      (Math.random() - 0.5) * 0.16
    );
    addShadow(mesh);

    const aggregate = new BABYLON.PhysicsAggregate(
      mesh,
      BABYLON.PhysicsShapeType.BOX,
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

  function resetRound() {
    clearRoundBodies();
    thrown = false;
    ui.throwBtn.disabled = false;
    ui.throwBtn.textContent = 'БРОСИТЬ САКА';
    ui.hint.textContent = 'САКА падает по физической дуге сверху в кучку';
    ui.hint.style.opacity = '1';

    const chukoColors = [
      new BABYLON.Color3(0.74,0.67,0.54),
      new BABYLON.Color3(0.62,0.57,0.45),
      new BABYLON.Color3(0.80,0.72,0.57)
    ];

    const n = C.pile.chukoCount;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const ring = i < 4 ? 0.34 : (0.50 + Math.random() * C.pile.spreadRadius * 0.48);
      const x = Math.cos(angle) * ring + (Math.random() - 0.5) * 0.12;
      const z = Math.sin(angle) * ring + C.pile.offsetZ + (Math.random() - 0.5) * 0.12;
      const d = C.pieces.chuko;
      createPiece(
        `chuko-${i+1}`,
        d,
        new BABYLON.Vector3(x, d.height * 0.60, z),
        chukoColors[i % chukoColors.length]
      );
    }

    const kd = C.pieces.khan;
    createPiece(
      'KHAN',
      kd,
      new BABYLON.Vector3(0.03, kd.height * 0.64, C.pile.offsetZ - 0.03),
      new BABYLON.Color3(0.95, 0.67, 0.12),
      true
    );

    const sd = C.pieces.saka;
    const sakaMat = material('saka-mat', new BABYLON.Color3(0.10, 0.43, 0.92), 0.34, 0.22);
    saka = BABYLON.MeshBuilder.CreateSphere('SAKA', {
      diameter: sd.diameter,
      segments: isMobile() ? 12 : 18
    }, scene);
    saka.scaling.set(1.0, 0.78, 1.12);
    saka.position.set(C.throw.start.x, C.throw.start.y, C.throw.start.z);
    saka.material = sakaMat;
    addShadow(saka);

    sakaAggregate = new BABYLON.PhysicsAggregate(
      saka,
      BABYLON.PhysicsShapeType.SPHERE,
      {
        mass: sd.mass,
        friction: C.physics.sakaFriction,
        restitution: C.physics.sakaRestitution
      },
      scene
    );
    bodies.push({ mesh: saka, aggregate: sakaAggregate });

    // Keep SAKA parked before the user throws it.
    sakaAggregate.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
    updateBodyCount();
  }

  function ballisticVelocity(start, target, flightTime, gravityY) {
    // target = start + v*t + 1/2*g*t^2
    const g = new BABYLON.Vector3(0, gravityY, 0);
    return target.subtract(start).subtract(g.scale(0.5 * flightTime * flightTime)).scale(1 / flightTime);
  }

  function throwSaka() {
    if (thrown || !saka || !sakaAggregate) return;
    thrown = true;
    ui.throwBtn.disabled = true;
    ui.throwBtn.textContent = 'САКА В ПОЛЁТЕ…';
    ui.hint.textContent = 'Реальная баллистика Havok: подъём → падение сверху → столкновение';

    const jitter = C.throw.targetJitter;
    const target = new BABYLON.Vector3(
      (Math.random() - 0.5) * jitter * 2,
      C.throw.targetY,
      C.pile.offsetZ + (Math.random() - 0.5) * jitter * 1.1
    );
    const start = new BABYLON.Vector3(C.throw.start.x, C.throw.start.y, C.throw.start.z);

    sakaAggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
    saka.position.copyFrom(start);
    sakaAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
    sakaAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());

    const v = ballisticVelocity(start, target, C.throw.flightTime, C.physics.gravity);
    sakaAggregate.body.setLinearVelocity(v);
    sakaAggregate.body.setAngularVelocity(new BABYLON.Vector3(
      -C.throw.sideSpin * 0.55,
      C.throw.sideSpin * 0.20,
      C.throw.sideSpin
    ));

    resetTimer = window.setTimeout(() => {
      ui.throwBtn.disabled = false;
      ui.throwBtn.textContent = 'ЕЩЁ БРОСОК';
      ui.hint.textContent = 'Нажмите «Ещё бросок» — кучка будет собрана заново';
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
      // If SAKA leaves the test area, stop it from running away forever.
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

    // Tap/click in the upper play area launches the throw; controls remain untouched.
    ui.canvas.addEventListener('pointerup', (event) => {
      if (event.clientY < innerHeight * 0.78 && !thrown) throwSaka();
    }, { passive: true });

    updatePerf();
  }

  boot().catch(showFatal);
})();
