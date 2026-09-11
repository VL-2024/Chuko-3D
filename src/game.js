(() => {
  'use strict';

  const C = window.CHUKO3D_CONFIG;
  const LMS = window.X2LMS;
  const ScenarioCfg = window.X2ChukoScenarioConfig;
  const LMS_CFG = window.X2_GAME_CONFIG || {};
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
    fatalText: document.getElementById('fatalText'),
    tuneBtn: document.getElementById('tuneBtn'),
    tunePanel: document.getElementById('tunePanel'),
    tuneCloseBtn: document.getElementById('tuneCloseBtn'),
    tuneDefaultsBtn: document.getElementById('tuneDefaultsBtn'),
    tuneCopyBtn: document.getElementById('tuneCopyBtn'),
    tuneOutput: document.getElementById('tuneOutput'),
    demoModeBtn: document.getElementById('demoModeBtn'),
    realModeBtn: document.getElementById('realModeBtn'),
    ticketNo: document.getElementById('ticketNo'),
    balanceValue: document.getElementById('balanceValue'),
    resultCard: document.getElementById('resultCard'),
    resultMain: document.getElementById('resultMain'),
    resultSub: document.getElementById('resultSub'),
    fieldPhoto: document.querySelector('.field-photo')
  };

  let engine;
  let scene;
  let field;
  let pileShadow = null;
  let sakaShadow = null;
  let sakaShadowMat = null;
  let sakaShadowBaseAlpha = 0.20;
  let sakaShadowBaseScale = 0.74;
  let sakaShadowBaseY = 0.014;
  let impactFlash = null;
  let impactFlashMat = null;
  let dustSystem = null;
  let dustEmitter = null;
  let impactFxState = { active: false, elapsed: 0, duration: 0.42, maxScale: 1.0, power: 0 };
  let saka = null;
  let sakaAggregate = null;
  let bodies = [];
  const SAKA_VISUAL_LIFT_BASE = 0.105;
  const SAKA_VISUAL_LIFT_EDGE_FACTOR = 0.055;
  const SAKA_VISUAL_LIFT_EDGE_START = 0.45;
  const SAKA_VISUAL_LIFT_EDGE_MAX = 0.095;
  let thrown = false;
  let resetTimer = 0;
  let pileReleasedForThrow = false;
  let lowFpsStartedAt = 0;
  let adaptiveScaleApplied = false;
  let roundIndex = 0;
  let aimDots = [];
  let aimTarget = null;
  let aimDotMaterial = null;
  let aimState = { dragging: false, pointerId: null, power: 0, guideDir: null, targetPoint: null, tapCandidate: false, downX: 0, downY: 0 };
  let throwState = { active: false, targetPoint: null, guideDir: null, power: 0, impactBoosted: false, flightTime: 0 };
  let roundSeed = 1;
  const gameState = {
    phase: 'loading',
    mode: 'demo',
    denomination: Number(C.game?.defaultDenomination || 25),
    denominations: [...(C.game?.denominations || [25,50,100])],
    currency: 'KGS',
    currencyDisplay: 'сом',
    language: 'RU',
    demoAllowed: true,
    balance: 0,
    demoBalance: Number(LMS_CFG.demoBalance || 10000),
    realBalance: null,
    pendingBalance: null,
    ticket: null,
    ticketReady: false,
    resultShown: false,
    busy: false
  };
  const scenarioRuntime = {
    plan: null,
    targetIds: new Set(),
    targetDirections: new Map(),
    outIds: new Set(),
    khanTarget: false,
    khanOut: false,
    seed: '',
    impactAt: 0,
    targetsLockedAtImpact: false,
    flightPlan: [],
    scatterStartedAt: 0,
    scatterActive: false,
    scatterComplete: false,
    active: false
  };
  // v0.12.1: dynamic round objects are created once and reused on every reset.
  // This avoids rebuilding convex hulls/materials/shadow casters when the player taps «ЕЩЁ БРОСОК».
  const roundPool = { initialized: false, chukos: [], khan: null, saka: null };
  const modelBank = {
    ready: false,
    chuko: null,
    khan: null,
    saka: null
  };
  let prestepRestoreScheduled = false;
  const prestepRestoreQueue = [];
  const chukoClampPending = new Set();
  let sakaClampPending = false;
  let roundPhysicsFrozen = false;

  const TUNE_STORAGE_KEY = 'chuko3d-v0113-stable-game';
  const TUNE_DEFAULTS = Object.freeze({
    fieldWidth: 88,
    fieldBottom: 280,
    fieldX: 0,
    bgScale: 1.01,
    bgX: 0,
    bgY: 8,
    pileX: -0.08,
    pileZ: -1.20,
    spreadX: 0.54,
    spreadZ: 0.68,
    chukoScale: 0.60,
    cameraRadius: 8.95,
    cameraTargetX: 0.00,
    cameraTargetZ: 0.18,
    sakaX: -0.16,
    sakaZ: 2.85,
    chukoModelScale: 1.10,
    chukoModelY: -0.16,
    khanModelScale: 1.22,
    khanModelY: 0.01,
    sakaModelScale: 0.90,
    sakaModelY: 0.00,
    sakaModelYawDeg: 0,
    sakaModelPitchDeg: -100,
    sakaModelRollDeg: -90
  });

  function loadTuning() {
    try {
      const raw = localStorage.getItem(TUNE_STORAGE_KEY);
      if (!raw) return { ...TUNE_DEFAULTS };
      const parsed = JSON.parse(raw);
      return { ...TUNE_DEFAULTS, ...parsed };
    } catch (_) {
      return { ...TUNE_DEFAULTS };
    }
  }

  let tuning = loadTuning();
  let tuningResetTimer = 0;

  function saveTuning() {
    try { localStorage.setItem(TUNE_STORAGE_KEY, JSON.stringify(tuning)); } catch (_) {}
  }

  function throwStartPoint() {
    return { x: Number(tuning.sakaX), y: C.throw.start.y, z: Number(tuning.sakaZ) };
  }


  function pilePieceScale() {
    return Math.max(0.5, Number(tuning.chukoScale) || 1);
  }

  function applyPilePieceScale() {
    if (!roundPool.initialized) return;
    const s = pilePieceScale();
    for (const item of roundPool.chukos) {
      if (item?.mesh?.scaling?.setAll) item.mesh.scaling.setAll(s);
    }
    // chukoScale changes only the 12 regular chükö. KHAN keeps its own scale.
    if (roundPool.khan?.mesh?.scaling?.setAll) roundPool.khan.mesh.scaling.setAll(1);
    applyAllVisualTuning();
    updatePileShadow();
  }


  function setPileBodiesMotionDynamic() {
    if (!roundPool.initialized) return;
    const items = [...roundPool.chukos, roundPool.khan].filter(Boolean);
    for (const item of items) {
      const body = item?.aggregate?.body;
      if (!body) continue;
      try {
        body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
        body.setLinearVelocity(BABYLON.Vector3.Zero());
        body.setAngularVelocity(BABYLON.Vector3.Zero());
      } catch (_) {}
    }
  }

  function releasePileIfImpactIsImminent() {
    if (pileReleasedForThrow || !throwState.active || !saka || !sakaAggregate || !throwState.targetPoint) return;

    const velocity = readLinearVelocity(sakaAggregate.body);
    if (velocity.y >= -0.12) return;

    const tp = throwState.targetPoint;
    const horizontalError = Math.hypot(saka.position.x - tp.x, saka.position.z - tp.z);
    const releaseY = Number(C.throw.pileReleaseY || 0.58);
    const maxError = Number(C.throw.pileReleaseHorizontalError || 0.14);

    // Do not free the pile merely because SAKA is near one of the pieces. First
    // require SAKA to be lined up with the selected X/Z aim point. This prevents
    // the pile from moving early and prevents an off-axis static collision from
    // changing the final landing point.
    if (saka.position.y > releaseY || horizontalError > maxError) return;

    if (scenarioRuntime.active && C.game?.deterministicScatter !== false) {
      // Scenario rounds keep the pile static until the single deterministic
      // scatter animation starts at contact.
      pileReleasedForThrow = true;
      return;
    }
    setPileBodiesMotionDynamic();
    pileReleasedForThrow = true;
  }

  function getTemplateBounds(meshes) {
    const geometryMeshes = meshes.filter(m => m && typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0);
    let min = new BABYLON.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    let max = new BABYLON.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    for (const mesh of geometryMeshes) {
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
      max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
    }
    const size = max.subtract(min);
    return { min, max, size, maxExtent: Math.max(size.x, size.y, size.z) };
  }

  async function loadGlbTemplate(kind, fileName) {
    const result = await BABYLON.SceneLoader.ImportMeshAsync(null, C.glb.rootUrl, fileName, scene);
    const topLevel = result.meshes.filter(m => !m.parent);
    const root = topLevel.find(m => m.name === '__root__') || topLevel[0] || result.meshes[0];
    if (!root) throw new Error(`GLB ${kind}: корневой mesh не найден`);

    result.meshes.forEach(m => {
      m.isPickable = false;
      m.alwaysSelectAsActiveMesh = false;
    });
    const bounds = getTemplateBounds(result.meshes);
    if (!Number.isFinite(bounds.maxExtent) || bounds.maxExtent <= 0) {
      throw new Error(`GLB ${kind}: некорректные размеры модели`);
    }
    root.setEnabled(false);
    return { kind, fileName, root, bounds, meshes: result.meshes };
  }

  async function loadGlbModels() {
    if (!BABYLON.SceneLoader) throw new Error('Babylon GLTF loader не загрузился');
    ui.badge.textContent = 'HAVOK · GLB…';
    const [chuko, khan, sakaModel] = await Promise.all([
      loadGlbTemplate('chuko', C.glb.chukoFile),
      loadGlbTemplate('khan', C.glb.khanFile),
      loadGlbTemplate('saka', C.glb.sakaFile)
    ]);
    modelBank.chuko = chuko;
    modelBank.khan = khan;
    modelBank.saka = sakaModel;
    modelBank.ready = true;
    ui.badge.textContent = 'HAVOK · GLB READY';
    console.info('[CHUKO 0.12.1] GLB bounds', {
      chuko: chuko.bounds.size,
      khan: khan.bounds.size,
      saka: sakaModel.bounds.size
    });
  }

  function visualTuningForKind(kind) {
    if (kind === 'chuko') return {
      scale: Number(tuning.chukoModelScale || 1),
      y: Number(tuning.chukoModelY || 0),
      targetMax: Number(C.glb.chukoTargetMax || 0.53),
      yaw: 0,
      commonScale: pilePieceScale()
    };
    if (kind === 'khan') return {
      scale: Number(tuning.khanModelScale || 1),
      y: Number(tuning.khanModelY || 0),
      targetMax: Number(C.glb.khanTargetMax || 0.54),
      yaw: 0,
      commonScale: 1
    };
    return {
      scale: Number(tuning.sakaModelScale || 1),
      y: Number(tuning.sakaModelY || 0),
      targetMax: Number(C.glb.sakaTargetMax || 0.76),
      yaw: Number(tuning.sakaModelYawDeg ?? 20) * Math.PI / 180,
      pitch: Number(tuning.sakaModelPitchDeg ?? 0) * Math.PI / 180,
      roll: Number(tuning.sakaModelRollDeg ?? 0) * Math.PI / 180,
      commonScale: 1
    };
  }

  function boostColor3(color, factor, lift = 0) {
    if (!color) return new BABYLON.Color3(lift, lift, lift);
    return new BABYLON.Color3(
      Math.min(1, color.r * factor + lift),
      Math.min(1, color.g * factor + lift),
      Math.min(1, color.b * factor + lift)
    );
  }

  function brightenImportedMaterial(mat, kind, suffix) {
    if (!mat || typeof mat.clone !== 'function') return mat;
    const clone = mat.clone(`${mat.name || kind}-lift-${suffix}`);
    const warm = kind === 'khan';
    const factor = warm ? 1.24 : 1.18;
    const lift = warm ? 0.028 : 0.020;

    if (clone.albedoColor) clone.albedoColor = boostColor3(clone.albedoColor, factor, lift);
    if (clone.diffuseColor) clone.diffuseColor = boostColor3(clone.diffuseColor, factor, lift);
    if (clone.specularColor) clone.specularColor = boostColor3(clone.specularColor, warm ? 1.06 : 1.04, 0.0);
    if (clone.ambientColor) clone.ambientColor = boostColor3(clone.ambientColor, factor, lift * 0.4);

    if (clone.albedoTexture && 'level' in clone.albedoTexture) {
      clone.albedoTexture.level = (clone.albedoTexture.level || 1) * (warm ? 1.10 : 1.08);
    }
    if (clone.diffuseTexture && 'level' in clone.diffuseTexture) {
      clone.diffuseTexture.level = (clone.diffuseTexture.level || 1) * (warm ? 1.10 : 1.08);
    }

    if ('roughness' in clone && Number.isFinite(clone.roughness)) clone.roughness = Math.max(0.16, clone.roughness * 0.88);
    if ('metallic' in clone && Number.isFinite(clone.metallic) && warm) clone.metallic = Math.max(clone.metallic, 0.22);

    const emissiveLift = warm
      ? new BABYLON.Color3(0.11, 0.075, 0.028)
      : new BABYLON.Color3(0.035, 0.055, 0.11);

    if (clone.emissiveColor) {
      clone.emissiveColor = new BABYLON.Color3(
        Math.min(1, clone.emissiveColor.r + emissiveLift.r),
        Math.min(1, clone.emissiveColor.g + emissiveLift.g),
        Math.min(1, clone.emissiveColor.b + emissiveLift.b)
      );
    } else {
      clone.emissiveColor = emissiveLift;
    }

    return clone;
  }

  function brightenImportedVisualMaterials(kind, meshes, suffix) {
    if (kind !== 'khan' && kind !== 'saka') return;
    const cache = new Map();
    for (const mesh of meshes) {
      const mat = mesh?.material;
      if (!mat) continue;
      const key = String(mat.uniqueId || mat.id || mat.name || Math.random());
      if (!cache.has(key)) cache.set(key, brightenImportedMaterial(mat, kind, suffix));
      mesh.material = cache.get(key);
    }
  }

  function createGlbVisual(kind, name) {
    const template = modelBank[kind];
    if (!template) return null;

    const anchor = new BABYLON.TransformNode(`${name}-visual-anchor`, scene);
    anchor.rotationQuaternion = BABYLON.Quaternion.Identity();
    const pose = new BABYLON.TransformNode(`${name}-visual-pose`, scene);
    pose.parent = anchor;
    pose.rotationQuaternion = BABYLON.Quaternion.Identity();

    const rootClone = template.root.clone(`${name}-glb-root`, pose, false);
    if (!rootClone) {
      anchor.dispose();
      return null;
    }
    rootClone.setEnabled(true);
    if (typeof rootClone.getDescendants === 'function') {
      rootClone.getDescendants(false).forEach(n => {
        if (typeof n.setEnabled === 'function') n.setEnabled(true);
        if ('isPickable' in n) n.isPickable = false;
      });
    }

    const descendants = typeof rootClone.getChildMeshes === 'function' ? rootClone.getChildMeshes(false) : [];
    if (rootClone.getTotalVertices && rootClone.getTotalVertices() > 0) descendants.push(rootClone);
    brightenImportedVisualMaterials(kind, descendants, name);
    descendants.forEach(m => addShadow(m));

    const visual = {
      kind,
      anchor,
      pose,
      root: rootClone,
      baseScale: 1 / template.bounds.maxExtent
    };
    applyVisualTuning(visual);
    return visual;
  }

  function applyVisualTuning(visual) {
    if (!visual) return;
    const vt = visualTuningForKind(visual.kind);
    const s = visual.baseScale * vt.targetMax * vt.scale * vt.commonScale;
    visual.pose.scaling.setAll(s);
    visual.pose.position.set(0, vt.y, 0);
    visual.pose.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(vt.pitch || 0, vt.yaw || 0, vt.roll || 0);
  }

  function applyAllVisualTuning() {
    if (!roundPool.initialized) return;
    roundPool.chukos.forEach(item => applyVisualTuning(item.visual));
    applyVisualTuning(roundPool.khan?.visual);
    applyVisualTuning(roundPool.saka?.visual);
  }

  function syncVisualItem(item) {
    if (!item?.mesh || !item?.visual?.anchor) return;
    const anchor = item.visual.anchor;
    anchor.position.copyFrom(item.mesh.position);
    if (item.visual?.kind === 'saka') {
      // Visual-only anti-clipping lift. It does not touch Havok physics.
      // The extra lift is radial, so it also works on the left/right edges,
      // not only on the far Z edge.
      const pileX = Number(tuning.pileX || 0);
      const pileZ = Number(tuning.pileZ || 0);
      const radialFromPile = Math.hypot(
        item.mesh.position.x - pileX,
        item.mesh.position.z - pileZ
      );
      const edgeDelta = Math.max(0, radialFromPile - SAKA_VISUAL_LIFT_EDGE_START);
      const extraLift = Math.min(
        SAKA_VISUAL_LIFT_EDGE_MAX,
        edgeDelta * SAKA_VISUAL_LIFT_EDGE_FACTOR
      );
      anchor.position.y += SAKA_VISUAL_LIFT_BASE + extraLift;
    }
    if (item.mesh.rotationQuaternion) {
      if (!anchor.rotationQuaternion) anchor.rotationQuaternion = BABYLON.Quaternion.Identity();
      anchor.rotationQuaternion.copyFrom(item.mesh.rotationQuaternion);
    } else {
      anchor.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(item.mesh.rotation.x, item.mesh.rotation.y, item.mesh.rotation.z);
    }
  }

  function syncAllGlbVisuals() {
    if (!modelBank.ready || !roundPool.initialized) return;
    roundPool.chukos.forEach(syncVisualItem);
    syncVisualItem(roundPool.khan);
    syncVisualItem(roundPool.saka);
  }

  function applyDomTuning() {
    const root = document.documentElement;
    root.style.setProperty('--field-width', `${Number(tuning.fieldWidth)}vw`);
    root.style.setProperty('--field-bottom', `${Number(tuning.fieldBottom)}px`);
    root.style.setProperty('--field-x', `${Number(tuning.fieldX)}px`);
    root.style.setProperty('--bg-scale', String(Number(tuning.bgScale)));
    root.style.setProperty('--bg-x', `${Number(tuning.bgX)}px`);
    root.style.setProperty('--bg-y', `${Number(tuning.bgY)}px`);
    updatePileShadow();
  }

  function applyCameraTuning() {
    const camera = scene?.activeCamera;
    if (!camera) return;
    if (typeof camera.radius === 'number') camera.radius = Number(tuning.cameraRadius);
    if (camera.target?.set) {
      camera.target.set(
        Number(tuning.cameraTargetX),
        C.camera.target.y,
        Number(tuning.cameraTargetZ)
      );
    }
  }

  function tuningAffectsRound(key) {
    return ['pileX','pileZ','spreadX','spreadZ','chukoScale','sakaX','sakaZ'].includes(key);
  }

  function scheduleTuningRoundReset() {
    window.clearTimeout(tuningResetTimer);
    tuningResetTimer = window.setTimeout(() => {
      if (scene && roundPool.initialized) resetRound();
    }, 90);
  }

  function tuneNumberLabel(key, value) {
    const v = Number(value);
    if (['fieldWidth'].includes(key)) return `${Math.round(v)}vw`;
    if (['fieldBottom','fieldX','bgX','bgY'].includes(key)) return `${Math.round(v)}px`;
    if (['bgScale','chukoScale','chukoModelScale','khanModelScale','sakaModelScale'].includes(key)) return `${v.toFixed(2)}×`;
    if (['sakaModelYawDeg','sakaModelPitchDeg','sakaModelRollDeg'].includes(key)) return `${Math.round(v)}°`; 
    if (key === 'cameraRadius') return v.toFixed(2);
    return v.toFixed(2);
  }

  function refreshTuneUi() {
    document.querySelectorAll('[data-tune]').forEach(input => {
      const key = input.dataset.tune;
      if (!(key in tuning)) return;
      input.value = String(tuning[key]);
      const out = document.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = tuneNumberLabel(key, tuning[key]);
    });
    if (ui.tuneOutput) {
      ui.tuneOutput.value = JSON.stringify(tuning, null, 2);
    }
  }

  function setTunePanelOpen(open) {
    if (!ui.tunePanel || !ui.tuneBtn) return;
    ui.tunePanel.hidden = !open;
    ui.tuneBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    ui.tuneBtn.textContent = open ? '⚙ ЗАКРЫТЬ' : '⚙ НАСТРОЙКА';
  }

  async function copyTuning() {
    const text = JSON.stringify(tuning, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      if (ui.tuneCopyBtn) {
        const old = ui.tuneCopyBtn.textContent;
        ui.tuneCopyBtn.textContent = 'СКОПИРОВАНО';
        window.setTimeout(() => { ui.tuneCopyBtn.textContent = old; }, 1200);
      }
    } catch (_) {
      if (ui.tuneOutput) {
        ui.tuneOutput.focus();
        ui.tuneOutput.select();
      }
    }
  }

  function bindTuner() {
    applyDomTuning();
    refreshTuneUi();

    ui.tuneBtn?.addEventListener('click', () => {
      setTunePanelOpen(ui.tunePanel?.hidden ?? true);
    });
    ui.tuneCloseBtn?.addEventListener('click', () => setTunePanelOpen(false));

    document.querySelectorAll('[data-tune]').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.tune;
        const min = Number(input.min);
        const max = Number(input.max);
        let value = Number(input.value);
        if (Number.isFinite(min)) value = Math.max(min, value);
        if (Number.isFinite(max)) value = Math.min(max, value);
        tuning[key] = value;
        saveTuning();
        applyDomTuning();
        applyCameraTuning();
        applyPilePieceScale();
        applyAllVisualTuning();
        const out = document.querySelector(`[data-out="${key}"]`);
        if (out) out.textContent = tuneNumberLabel(key, value);
        if (ui.tuneOutput) ui.tuneOutput.value = JSON.stringify(tuning, null, 2);
        if (tuningAffectsRound(key)) scheduleTuningRoundReset();
      });
    });

    ui.tuneDefaultsBtn?.addEventListener('click', () => {
      tuning = { ...TUNE_DEFAULTS };
      saveTuning();
      applyDomTuning();
      applyCameraTuning();
      applyPilePieceScale();
      applyAllVisualTuning();
      refreshTuneUi();
      scheduleTuningRoundReset();
    });
    ui.tuneCopyBtn?.addEventListener('click', copyTuning);
  }

  applyDomTuning();

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

  function createRadialShadowTexture(name) {
    const size = 256;
    const tex = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, false);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, size, size);
    const grad = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.10, size * 0.5, size * 0.5, size * 0.5);
    grad.addColorStop(0.0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.32, 'rgba(0,0,0,0.46)');
    grad.addColorStop(0.66, 'rgba(0,0,0,0.12)');
    grad.addColorStop(1.0, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.hasAlpha = true;
    tex.update(false);
    return tex;
  }

  function createImpactTexture(name, mode = 'ring') {
    const size = 256;
    const tex = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, false);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, size, size);
    const cx = size * 0.5;
    const cy = size * 0.5;

    if (mode === 'ring') {
      const grad = ctx.createRadialGradient(cx, cy, size * 0.14, cx, cy, size * 0.5);
      grad.addColorStop(0.00, 'rgba(255,255,255,0.0)');
      grad.addColorStop(0.42, 'rgba(255,255,255,0.0)');
      grad.addColorStop(0.60, 'rgba(255,255,255,0.36)');
      grad.addColorStop(0.76, 'rgba(255,255,255,0.92)');
      grad.addColorStop(0.88, 'rgba(255,255,255,0.24)');
      grad.addColorStop(1.00, 'rgba(255,255,255,0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    } else {
      const grad = ctx.createRadialGradient(cx, cy, size * 0.06, cx, cy, size * 0.5);
      grad.addColorStop(0.00, 'rgba(255,245,220,0.92)');
      grad.addColorStop(0.22, 'rgba(255,220,170,0.50)');
      grad.addColorStop(0.52, 'rgba(255,184,96,0.18)');
      grad.addColorStop(1.00, 'rgba(255,184,96,0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }

    tex.hasAlpha = true;
    tex.update(false);
    return tex;
  }

  function createDustTexture(name) {
    const size = 128;
    const tex = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, false);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, size, size);
    const grad = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.08, size * 0.5, size * 0.5, size * 0.5);
    grad.addColorStop(0.0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.hasAlpha = true;
    tex.update(false);
    return tex;
  }

  function createShadowPlane(name, width, height, alpha = 0.22) {
    const mesh = BABYLON.MeshBuilder.CreateGround(name, { width, height, subdivisions: 1 }, scene);
    const mat = new BABYLON.StandardMaterial(`${name}-mat`, scene);
    mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
    mat.opacityTexture = createRadialShadowTexture(`${name}-tex`);
    mat.useAlphaFromDiffuseTexture = false;
    mat.alpha = alpha;
    mat.disableLighting = true;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 0;
    return { mesh, mat };
  }

  function createImpactPlane(name, width, height, alpha, mode = 'ring') {
    const mesh = BABYLON.MeshBuilder.CreateGround(name, { width, height, subdivisions: 1 }, scene);
    const mat = new BABYLON.StandardMaterial(`${name}-mat`, scene);
    mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    mat.emissiveColor = mode === 'ring'
      ? new BABYLON.Color3(1.0, 0.84, 0.44)
      : new BABYLON.Color3(0.96, 0.66, 0.24);
    mat.opacityTexture = createImpactTexture(`${name}-tex`, mode);
    mat.useAlphaFromDiffuseTexture = false;
    mat.alpha = alpha;
    mat.disableLighting = true;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 1;
    mesh.setEnabled(false);
    return { mesh, mat };
  }

  function ensureImpactDustSystem() {
    if (dustSystem) return;
    dustEmitter = new BABYLON.TransformNode('impact-dust-emitter', scene);
    dustEmitter.position.set(0, 0.075, 0);

    const ps = new BABYLON.ParticleSystem('impact-dust', 42, scene);
    ps.particleTexture = createDustTexture('impact-dust-tex');
    ps.emitter = dustEmitter;
    ps.minEmitBox = new BABYLON.Vector3(-0.05, 0.00, -0.05);
    ps.maxEmitBox = new BABYLON.Vector3( 0.05, 0.035,  0.05);

    // Dry earth tones with low alpha: a small irregular puff rather than a game FX ring.
    ps.color1 = new BABYLON.Color4(0.73, 0.60, 0.44, 0.58);
    ps.color2 = new BABYLON.Color4(0.51, 0.40, 0.28, 0.38);
    ps.colorDead = new BABYLON.Color4(0.24, 0.19, 0.14, 0.0);

    ps.minSize = 0.065;
    ps.maxSize = 0.16;
    ps.minLifeTime = 0.34;
    ps.maxLifeTime = 0.72;
    ps.manualEmitCount = 0;
    ps.emitRate = 0;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new BABYLON.Vector3(0, -0.48, 0);

    // Low, uneven cone of dust close to the ground.
    ps.direction1 = new BABYLON.Vector3(-0.42, 0.16, -0.32);
    ps.direction2 = new BABYLON.Vector3( 0.46, 0.62,  0.38);
    ps.minEmitPower = 0.16;
    ps.maxEmitPower = 0.42;
    ps.minAngularSpeed = -1.2;
    ps.maxAngularSpeed = 1.2;
    ps.minInitialRotation = -Math.PI;
    ps.maxInitialRotation = Math.PI;
    ps.updateSpeed = 0.014;
    ps.disposeOnStop = false;
    dustSystem = ps;
  }

  function updatePileShadow() {
    if (!pileShadow) return;
    const spreadX = Number(tuning.spreadX || 0.7);
    const spreadZ = Number(tuning.spreadZ || 0.68);
    const pieceScale = pilePieceScale();
    pileShadow.position.set(Number(tuning.pileX || 0), 0.012, Number(tuning.pileZ || 0) - 0.03);
    pileShadow.scaling.x = (1.10 + spreadX * 1.85) * pieceScale;
    pileShadow.scaling.z = (0.96 + spreadZ * 1.62) * pieceScale;
  }

  function updateSakaShadow() {
    if (!sakaShadow || !saka || !sakaShadowMat) return;
    const h = Math.max(0, saka.position.y);
    const fade = Math.max(0.28, 1 - h * 0.10);
    const scale = Math.max(0.52, 1 - h * 0.14);
    sakaShadow.position.set(saka.position.x, sakaShadowBaseY, saka.position.z);
    sakaShadow.scaling.x = sakaShadowBaseScale * scale;
    sakaShadow.scaling.z = sakaShadowBaseScale * 0.84 * scale;
    sakaShadowMat.alpha = sakaShadowBaseAlpha * fade;
  }

  function triggerImpactFx(point, power = 0.6) {
    const p = clamp01(power);

    // Very short local contact flash only; no expanding ring.
    if (impactFlash && impactFlashMat) {
      impactFlash.position.set(point.x, 0.015, point.z);
      impactFlash.scaling.setAll(0.30 + p * 0.10);
      impactFlashMat.alpha = 0.16 + p * 0.05;
      impactFlash.setEnabled(true);
    }

    impactFxState = {
      active: true,
      elapsed: 0,
      duration: 0.16 + p * 0.06,
      maxScale: 0.38 + p * 0.10,
      power: p
    };

  }

  function updateImpactFx(dt) {
    if (!impactFxState.active) return;
    impactFxState.elapsed += dt;
    const t = Math.min(1, impactFxState.elapsed / Math.max(0.001, impactFxState.duration));
    const easeOut = 1 - Math.pow(1 - t, 2.0);

    if (impactFlash && impactFlashMat) {
      const s = 0.30 + impactFxState.maxScale * 0.38 * easeOut;
      impactFlash.scaling.x = s;
      impactFlash.scaling.z = s * 0.88;
      impactFlashMat.alpha = (1 - t) * (0.14 + impactFxState.power * 0.04);
    }

    if (t >= 1) {
      impactFxState.active = false;
      if (impactFlash) impactFlash.setEnabled(false);
    }
  }

  function updateShadowHelpers() {
    updatePileShadow();
    updateSakaShadow();
  }

  function mergeParts(name, parts, mat) {

    const merged = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    merged.name = name;
    merged.material = mat;
    return merged;
  }


  // v0.6 organic astragalus proxy.
  // The body is now one lofted mesh instead of a group of intersecting spheres.
  // Visually this reads much closer to a real chuko/saka while remaining cheap
  // enough for mobile and keeping a single CONVEX_HULL collider.
  function makeOrganicBone(name, dims, mat, opts = {}) {
    const ringCount = isMobile() ? (C.visual?.organicRingsMobile || 8) : (C.visual?.organicRingsDesktop || 11);
    const segCount = isMobile() ? (C.visual?.organicSegmentsMobile || 14) : (C.visual?.organicSegmentsDesktop || 18);
    const positions = [];
    const indices = [];
    const normals = [];
    const uvs = [];

    for (let r = 0; r <= ringCount; r++) {
      const t = -1 + (2 * r / ringCount);              // long axis: -1..1
      const a = Math.abs(t);
      const flare = Math.pow(a, 1.42);
      const endSoft = Math.pow(a, 3.1);

      // Hourglass waist + fuller ends, matching the characteristic talus silhouette.
      const rx = dims.width * 0.5 * (0.70 + 0.30 * flare);
      const ry = dims.height * 0.5 * (0.72 + 0.28 * Math.pow(a, 1.22));
      const twist = 0.105 * Math.sin(t * Math.PI * 0.5);
      const xBias = dims.width * 0.035 * Math.sin(t * Math.PI);
      const yBias = dims.height * 0.025 * Math.sin((t + 0.18) * Math.PI);

      for (let j = 0; j < segCount; j++) {
        const q = j / segCount;
        const th = q * Math.PI * 2 + twist;
        const c = Math.cos(th);
        const sn = Math.sin(th);

        // Four soft lobes on the ends, but a smoother centre than the v0.5 blob proxy.
        const lobe = 1 + (0.07 + 0.045 * flare) * Math.cos(2 * th) + 0.025 * Math.sin(3 * th + t * 1.7);
        const topValley = Math.max(0, sn) * (1 - a) * dims.height * 0.055;
        const lowerValley = Math.max(0, -sn) * (1 - a) * dims.height * 0.030;
        const endRound = 1 - 0.035 * endSoft * Math.cos(th);

        const x = xBias + rx * lobe * c * endRound;
        const y = yBias + ry * (1 + 0.055 * Math.cos(2 * th)) * sn - topValley + lowerValley;
        const z = t * dims.depth * 0.5;
        positions.push(x, y, z);
        uvs.push(q, r / ringCount);
      }
    }

    for (let r = 0; r < ringCount; r++) {
      for (let j = 0; j < segCount; j++) {
        const nj = (j + 1) % segCount;
        const a = r * segCount + j;
        const b = r * segCount + nj;
        const c = (r + 1) * segCount + j;
        const d = (r + 1) * segCount + nj;
        indices.push(a, c, b, b, c, d);
      }
    }

    // End caps.
    const cap0 = positions.length / 3;
    positions.push(0, 0, -dims.depth * 0.5);
    uvs.push(0.5, 0.5);
    const cap1 = positions.length / 3;
    positions.push(0, 0, dims.depth * 0.5);
    uvs.push(0.5, 0.5);
    for (let j = 0; j < segCount; j++) {
      const nj = (j + 1) % segCount;
      indices.push(cap0, nj, j);
      const last = ringCount * segCount;
      indices.push(cap1, last + j, last + nj);
    }

    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.uvs = uvs;

    const mesh = new BABYLON.Mesh(name, scene);
    vd.applyToMesh(mesh, true);
    mesh.material = mat;

    // A tiny non-uniform scale avoids the sterile mirrored look.
    mesh.scaling.x = opts.scaleX || 1;
    mesh.scaling.y = opts.scaleY || 1;
    return mesh;
  }

  function addTopBadge(parent, kind, dims) {
    if (!parent) return;
    if (kind === 'khan') {
      const enamelMat = material(`${parent.name}-enamel`, new BABYLON.Color3(0.018, 0.014, 0.012), 0.18, 0.76);
      const plate = BABYLON.MeshBuilder.CreateSphere(`${parent.name}-plate`, { diameter: 1, segments: isMobile() ? 10 : 14 }, scene);
      plate.parent = parent;
      plate.position.set(0, dims.height * 0.38, -dims.depth * 0.015);
      plate.scaling.set(dims.width * 0.34, dims.height * 0.045, dims.depth * 0.27);
      plate.material = enamelMat;

      const goldMat = material(`${parent.name}-badge-gold`, new BABYLON.Color3(0.86, 0.51, 0.07), 0.20, 0.92);
      const crest = BABYLON.MeshBuilder.CreateCylinder(`${parent.name}-crest`, {
        diameter: dims.width * 0.17,
        height: dims.height * 0.028,
        tessellation: 4
      }, scene);
      crest.parent = parent;
      crest.position.set(0, dims.height * 0.422, -dims.depth * 0.015);
      crest.rotation.y = Math.PI / 4;
      crest.material = goldMat;
      return;
    }

    if (kind === 'saka') {
      const goldMat = material(`${parent.name}-gold`, new BABYLON.Color3(0.91, 0.55, 0.08), 0.24, 0.88);
      const diamond = BABYLON.MeshBuilder.CreateCylinder(`${parent.name}-diamond`, {
        diameter: dims.width * 0.22,
        height: dims.height * 0.03,
        tessellation: 4
      }, scene);
      diamond.parent = parent;
      diamond.position.set(0, dims.height * 0.39, -dims.depth * 0.015);
      diamond.rotation.y = Math.PI / 4;
      diamond.material = goldMat;

      // Four small gold studs echo the approved blue/gold SAKA references.
      const studPositions = [
        [-0.20, 0.22], [0.20, 0.22], [-0.20, -0.22], [0.20, -0.22]
      ];
      studPositions.forEach(([x, z], i) => {
        const stud = BABYLON.MeshBuilder.CreateSphere(`${parent.name}-stud-${i}`, { diameter: dims.width * 0.075, segments: 8 }, scene);
        stud.parent = parent;
        stud.position.set(x * dims.width, dims.height * 0.385, z * dims.depth);
        stud.scaling.y = 0.34;
        stud.material = goldMat;
      });
    }
  }

  function makeChukoBone(name, dims, mat, khan = false) {
    const mesh = makeOrganicBone(name, dims, mat, {
      scaleX: khan ? 1.03 : (0.98 + Math.random() * 0.04),
      scaleY: khan ? 1.02 : (0.98 + Math.random() * 0.035)
    });
    if (khan) addTopBadge(mesh, 'khan', dims);
    return mesh;
  }

  function makeSakaBone(name, dims, mat) {
    const mesh = makeOrganicBone(name, dims, mat, { scaleX: 1.04, scaleY: 1.03 });
    addTopBadge(mesh, 'saka', dims);
    return mesh;
  }

  function freezeStatic(mesh) {
    if (!mesh) return mesh;
    mesh.isPickable = false;
    mesh.computeWorldMatrix(true);
    mesh.freezeWorldMatrix();
    return mesh;
  }

  function createSkyGradientTexture() {
    const size = Math.max(128, Number(C.environment?.skyTextureSize || 256));
    const tex = new BABYLON.DynamicTexture('sky-gradient', { width: 8, height: size }, scene, false);
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0.0, '#000000');
    grad.addColorStop(1.0, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 8, size);
    tex.update(false);
    return tex;
  }

  function createEnvironment() {
    // v0.12.1: background and field are now DOM/CSS layers, not Babylon meshes.
    // Babylon is used only for 3D pieces, trajectory and physics.
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.02;
    scene.imageProcessingConfiguration.contrast = 1.04;
    scene.fogMode = BABYLON.Scene.FOGMODE_NONE;

    const camera = new BABYLON.ArcRotateCamera(
      'camera',
      C.camera.alpha,
      isMobile() ? C.camera.betaMobile : C.camera.betaDesktop,
      Number(tuning.cameraRadius),
      new BABYLON.Vector3(Number(tuning.cameraTargetX), C.camera.target.y, Number(tuning.cameraTargetZ)),
      scene
    );
    camera.lowerRadiusLimit = 7.2;
    camera.upperRadiusLimit = 10.2;
    camera.lowerBetaLimit = 0.72;
    camera.upperBetaLimit = 1.20;
    camera.fov = 0.69;
    camera.inputs.clear();

    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.0, 1, -0.05), scene);
    hemi.intensity = 0.88;
    hemi.diffuse = new BABYLON.Color3(0.92, 0.91, 0.88);
    hemi.groundColor = new BABYLON.Color3(0.20, 0.19, 0.18);

    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.40, -1, 0.26), scene);
    sun.position = new BABYLON.Vector3(5, 8, -7);
    sun.intensity = 1.66;
    sun.diffuse = new BABYLON.Color3(1.0, 0.90, 0.72);

    const shadowMapSize = isMobile() ? 512 : 1024;
    const shadows = new BABYLON.ShadowGenerator(shadowMapSize, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.0018;
    scene.metadata = { shadows };

    // Invisible collision arena. The user sees the original 2D field image in the DOM.
    field = BABYLON.MeshBuilder.CreateCylinder('field', {
      height: C.field.thickness,
      diameter: C.field.visualRadius * 2,
      tessellation: 64
    }, scene);
    field.position.y = -C.field.thickness / 2;
    field.isVisible = false;

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

    // Safety floor, placed well below the visible play area.
    const groundPhysicsMesh = BABYLON.MeshBuilder.CreateBox('ground-physics', { width: 25, depth: 25, height: 0.18 }, scene);
    groundPhysicsMesh.position.y = -3.4;
    groundPhysicsMesh.isVisible = false;
    const groundAggregate = new BABYLON.PhysicsAggregate(
      groundPhysicsMesh,
      BABYLON.PhysicsShapeType.BOX,
      { mass: 0, friction: C.physics.groundFriction, restitution: C.physics.groundRestitution },
      scene
    );
    bodies.push({ mesh: groundPhysicsMesh, aggregate: groundAggregate, permanent: true });

    const pileShadowHelper = createShadowPlane('pile-shadow', 2.5, 2.0, 0.24);
    pileShadow = pileShadowHelper.mesh;
    pileShadow.rotationQuaternion = BABYLON.Quaternion.Identity();

    const sakaShadowHelper = createShadowPlane('saka-shadow', 0.9, 0.72, sakaShadowBaseAlpha);
    sakaShadow = sakaShadowHelper.mesh;
    sakaShadowMat = sakaShadowHelper.mat;
    sakaShadow.rotationQuaternion = BABYLON.Quaternion.Identity();


    const impactFlashHelper = createImpactPlane('impact-flash', 1.25, 1.25, 0.0, 'flash');
    impactFlash = impactFlashHelper.mesh;
    impactFlashMat = impactFlashHelper.mat;
    impactFlash.rotationQuaternion = BABYLON.Quaternion.Identity();

    updatePileShadow();
  }

  function addShadow(mesh) {
    const shadows = scene.metadata?.shadows;
    if (shadows && mesh) shadows.addShadowCaster(mesh, true);
  }

  function createPiece(name, dims, pos, color, isKhan = false, yaw = 0) {
    const mat = material(`${name}-mat`, color, isKhan ? 0.26 : 0.62, isKhan ? 0.90 : 0.02);
    mat.clearCoat.isEnabled = true;
    mat.clearCoat.intensity = isKhan ? 0.74 : 0.18;
    mat.clearCoat.roughness = isKhan ? 0.20 : 0.52;
    if (isKhan) {
      mat.emissiveColor = new BABYLON.Color3(0.025, 0.012, 0.002);
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
    const role = isKhan ? 'khan' : 'chuko';
    const visual = modelBank.ready ? createGlbVisual(role, name) : null;
    mesh.isVisible = !visual;
    bodies.push({ mesh, aggregate, role });
    return { mesh, aggregate, visual };
  }

  // v0.12.1 pooling/reset -------------------------------------------------------
  // Havok convex hull construction is relatively expensive compared with simply
  // teleporting an existing body. We therefore build the 12 chuko + KHAN + SAKA
  // once, keep their PhysicsAggregates alive and only reset their transforms.
  function queueBodyTransformReset(item, position, rotationQuaternion, activateAfterSync) {
    if (!item?.aggregate?.body || !item?.mesh) return;
    const body = item.aggregate.body;

    // Freeze first so the previous round cannot add another impulse while the body
    // is being teleported. Havok's mesh->body prestep sync is normally disabled
    // for performance, so enable it for exactly one frame.
    body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
    body.setLinearVelocity(BABYLON.Vector3.Zero());
    body.setAngularVelocity(BABYLON.Vector3.Zero());
    body.disablePreStep = false;

    item.mesh.position.copyFrom(position);
    item.mesh.rotationQuaternion = rotationQuaternion.clone();
    item.mesh.computeWorldMatrix(true);

    prestepRestoreQueue.push({ body, activateAfterSync });
    if (!prestepRestoreScheduled) {
      prestepRestoreScheduled = true;
      scene.onAfterRenderObservable.addOnce(() => {
        const queue = prestepRestoreQueue.splice(0);
        prestepRestoreScheduled = false;
        for (const entry of queue) {
          try {
            entry.body.disablePreStep = true;
            if (entry.activateAfterSync) {
              entry.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
              entry.body.setLinearVelocity(BABYLON.Vector3.Zero());
              entry.body.setAngularVelocity(BABYLON.Vector3.Zero());
            }
          } catch (_) {}
        }
      });
    }
  }

  function ensureRoundPool() {
    if (roundPool.initialized) return;

    const chukoColors = [
      new BABYLON.Color3(0.78,0.56,0.30),
      new BABYLON.Color3(0.70,0.47,0.24),
      new BABYLON.Color3(0.86,0.64,0.36)
    ];

    const d = C.pieces.chuko;
    const pileScale = pilePieceScale();
    for (let i = 0; i < C.pile.chukoCount; i++) {
      const item = createPiece(
        `chuko-${i+1}`,
        d,
        new BABYLON.Vector3(0, 4 + i * 0.03, 0),
        chukoColors[i % chukoColors.length],
        false,
        0
      );
      roundPool.chukos.push(item);
    }

    const kd = C.pieces.khan;
    roundPool.khan = createPiece(
      'KHAN',
      kd,
      new BABYLON.Vector3(0, 4.8, 0),
      new BABYLON.Color3(0.63, 0.30, 0.035),
      true,
      0
    );

    applyPilePieceScale();

    const sd = C.pieces.saka;
    const sakaMat = material('saka-mat', new BABYLON.Color3(0.018, 0.16, 0.62), 0.20, 0.54);
    sakaMat.clearCoat.isEnabled = true;
    sakaMat.clearCoat.intensity = 0.78;
    sakaMat.clearCoat.roughness = 0.19;
    const sakaMesh = makeSakaBone('SAKA', sd, sakaMat);
    { const start = throwStartPoint(); sakaMesh.position.set(start.x, start.y, start.z); }
    sakaMesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0.18, -0.45, 0.12);
    addShadow(sakaMesh);
    const aggregate = new BABYLON.PhysicsAggregate(
      sakaMesh,
      BABYLON.PhysicsShapeType.CONVEX_HULL,
      {
        mass: sd.mass,
        friction: C.physics.sakaFriction,
        restitution: C.physics.sakaRestitution
      },
      scene
    );
    const sakaVisual = modelBank.ready ? createGlbVisual('saka', 'SAKA') : null;
    sakaMesh.isVisible = !sakaVisual;
    bodies.push({ mesh: sakaMesh, aggregate, role: 'saka' });
    roundPool.saka = { mesh: sakaMesh, aggregate, visual: sakaVisual };

    roundPool.initialized = true;
    applyAllVisualTuning();
    syncAllGlbVisuals();
  }

  function pilePositions() {
    // World-space analogue of the approved compact v20.61 4×3 layout.
    const sx = Number(tuning.spreadX);
    const sz = Number(tuning.spreadZ);
    return [
      [-0.86*sx,-0.56*sz],[-0.29*sx,-0.68*sz],[ 0.29*sx,-0.68*sz],[ 0.86*sx,-0.56*sz],
      [-1.02*sx,-0.03*sz],[-0.48*sx,-0.02*sz],[ 0.48*sx,-0.02*sz],[ 1.02*sx,-0.03*sz],
      [-0.86*sx, 0.50*sz],[-0.29*sx, 0.60*sz],[ 0.29*sx, 0.60*sz],[ 0.86*sx, 0.50*sz]
    ];
  }

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i=0;i<String(str).length;i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededRng(seed) {
    let a = hashString(seed) || 1;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(values, rng) {
    const a = [...values];
    for (let i=a.length-1;i>0;i--) {
      const j = Math.floor(rng()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function scenarioPlan(value) {
    const item = ScenarioCfg?.getOrDefault(value);
    if (!item) return {regular:0,khan:false,key:'ZERO',id:1};
    return {regular:Number(item.regular||0), khan:Boolean(item.khan), key:item.key, id:item.id};
  }

  function prepareScenarioRuntime(ticket) {
    const plan = scenarioPlan(ticket?.scenario);
    const seed = `${ticket?.ticketId || 'ROUND'}|${plan.id}|${plan.key}`;
    const rng = seededRng(seed);
    const ids = shuffled([...Array(C.pile.chukoCount).keys()], rng).slice(0, Math.max(0, Math.min(C.pile.chukoCount, plan.regular)));
    const directions = new Map();
    ids.forEach((id, order) => {
      const base = -Math.PI * 0.92 + ((order + 1) / (ids.length + 1)) * Math.PI * 1.84;
      const jitter = (rng() - 0.5) * 0.38;
      directions.set(id, base + jitter);
    });
    scenarioRuntime.plan = plan;
    scenarioRuntime.targetIds = new Set(ids);
    scenarioRuntime.targetDirections = directions;
    scenarioRuntime.outIds = new Set();
    scenarioRuntime.khanTarget = plan.khan;
    scenarioRuntime.khanOut = false;
    scenarioRuntime.seed = seed;
    scenarioRuntime.impactAt = 0;
    scenarioRuntime.targetsLockedAtImpact = false;
    scenarioRuntime.flightPlan = [];
    scenarioRuntime.scatterStartedAt = 0;
    scenarioRuntime.scatterActive = false;
    scenarioRuntime.scatterComplete = false;
    scenarioRuntime.active = true;
  }

  function clearScenarioRuntime() {
    scenarioRuntime.plan = null;
    scenarioRuntime.targetIds = new Set();
    scenarioRuntime.targetDirections = new Map();
    scenarioRuntime.outIds = new Set();
    scenarioRuntime.khanTarget = false;
    scenarioRuntime.khanOut = false;
    scenarioRuntime.seed = '';
    scenarioRuntime.impactAt = 0;
    scenarioRuntime.targetsLockedAtImpact = false;
    scenarioRuntime.flightPlan = [];
    scenarioRuntime.scatterStartedAt = 0;
    scenarioRuntime.scatterActive = false;
    scenarioRuntime.scatterComplete = false;
    scenarioRuntime.active = false;
  }

  function formatMoney(value) {
    const n = Number(value || 0);
    return `${Number.isInteger(n) ? n : n.toFixed(2)} ${gameState.currencyDisplay || gameState.currency}`;
  }

  function currentTicketLabel() {
    return gameState.ticket?.ticketId ? `#${gameState.ticket.ticketId}` : '—';
  }

  function renderDenominationButtons() {
    const bar = document.querySelector('.denom-bar');
    if (!bar) return;
    const unit = bar.querySelector('em');
    bar.querySelectorAll('[data-denom]').forEach(node => node.remove());
    const values = [...new Set((gameState.denominations || []).map(Number).filter(v=>Number.isFinite(v)&&v>0))];
    values.forEach(value => {
      const b = document.createElement('button');
      b.className = 'denom';
      b.type = 'button';
      b.dataset.denom = String(value);
      b.textContent = String(value);
      b.addEventListener('click', () => {
        if (!['idle','settled'].includes(gameState.phase) || gameState.busy) return;
        gameState.denomination = value;
        gameState.ticket = null;
        gameState.ticketReady = false;
        hideGameResult();
        updateGameHud();
        LMS?.emit?.('X2_GAME_DENOMINATION_CHANGED', {gameId:LMS_CFG.gameId || 'CHUKO', denomination:value, currency:gameState.currency, mode:gameState.mode});
      });
      bar.insertBefore(b, unit);
    });
  }

  function renderGameControls() {
    const phase = gameState.phase;
    const canConfigure = ['idle','settled'].includes(phase) && !gameState.busy;
    document.querySelectorAll('[data-denom]').forEach(btn => btn.disabled = !canConfigure);
    if (ui.demoModeBtn) ui.demoModeBtn.disabled = !canConfigure || !gameState.demoAllowed;
    if (ui.realModeBtn) ui.realModeBtn.disabled = !canConfigure;
    if (ui.throwBtn) {
      ui.throwBtn.disabled = phase !== 'ready' || !gameState.ticketReady;
      ui.throwBtn.textContent = phase === 'throwing' ? 'САКА В ПОЛЁТЕ…' : 'БРОСИТЬ САКА';
    }
    if (ui.resetBtn) {
      ui.resetBtn.disabled = !canConfigure;
      ui.resetBtn.textContent = gameState.busy ? 'ЗАГРУЗКА…' : 'НОВАЯ ИГРА';
    }
  }

  function updateGameHud() {
    if (ui.ticketNo) ui.ticketNo.textContent = currentTicketLabel();
    if (ui.balanceValue) ui.balanceValue.textContent = formatMoney(gameState.balance);
    document.querySelectorAll('[data-denom]').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.denom) === gameState.denomination);
    });
    ui.demoModeBtn?.classList.toggle('active', gameState.mode === 'demo');
    ui.realModeBtn?.classList.toggle('active', gameState.mode === 'real');
    renderGameControls();
  }

  function hideGameResult() {
    gameState.resultShown = false;
    if (ui.resultCard) {
      ui.resultCard.hidden = true;
      ui.resultCard.classList.remove('win');
    }
  }

  function worldPointForWhiteMetric(angle, targetMetric, y=0.11) {
    let lo = 0.06;
    let hi = 3.20;
    let best = new BABYLON.Vector3(Math.cos(angle)*1.5, y, Math.sin(angle)*1.5);
    let bestDiff = Number.POSITIVE_INFINITY;

    for (let i=0;i<28;i++) {
      const r = (lo+hi)*0.5;
      const probe = new BABYLON.Vector3(Math.cos(angle)*r, y, Math.sin(angle)*r);
      const metric = whiteRingMetricForWorld(probe);
      if (metric == null || !Number.isFinite(metric)) break;
      const diff = Math.abs(metric-targetMetric);
      if (diff < bestDiff) { bestDiff = diff; best = probe; }
      if (metric < targetMetric) lo = r;
      else hi = r;
    }
    return best;
  }

  function deterministicLandingRotation(seed, index, isKhan=false) {
    const rng = seededRng(`${seed}|rot|${index}|${isKhan?'K':'C'}`);
    return BABYLON.Quaternion.FromEulerAngles(
      (rng()-0.5) * 1.85,
      rng() * Math.PI * 2,
      (rng()-0.5) * 1.85
    );
  }

  function prepareScenarioLandingPlan(tp) {
    if (!scenarioRuntime.active || !scenarioRuntime.plan || !roundPool.initialized) return;

    const plan = scenarioRuntime.plan;
    const count = Math.max(0, Math.min(C.pile.chukoCount, Number(plan.regular || 0)));
    const rng = seededRng(`${scenarioRuntime.seed}|landing-plan|${tp.x.toFixed(3)}|${tp.z.toFixed(3)}`);
    const pileX = Number(tuning.pileX || 0);
    const pileZ = Number(tuning.pileZ || 0);

    // Select the actual chükö closest to the chosen SAKA contact point BEFORE the throw starts.
    const scored = roundPool.chukos.map((item,index)=>({
      index,
      item,
      score: Math.hypot((item?.mesh?.position?.x||0)-tp.x,(item?.mesh?.position?.z||0)-tp.z) + rng()*0.025
    })).sort((a,b)=>a.score-b.score);
    const targetIds = scored.slice(0,count).map(v=>v.index);
    scenarioRuntime.targetIds = new Set(targetIds);
    scenarioRuntime.outIds = new Set();
    scenarioRuntime.khanOut = false;
    scenarioRuntime.targetsLockedAtImpact = true;

    const flightPlan = [];
    const insideIds = [...Array(C.pile.chukoCount).keys()].filter(i=>!scenarioRuntime.targetIds.has(i));
    const impactAngle = Math.atan2(tp.z-pileZ,tp.x-pileX);

    const insideMin = Number(C.game?.scatterInsideMetricMin || 0.44);
    const insideMax = Number(C.game?.scatterInsideMetricMax || 0.82);
    const outsideMin = Number(C.game?.scatterOutsideMetricMin || 1.18);
    const outsideMax = Number(C.game?.scatterOutsideMetricMax || 1.30);
    const durMin = Number(C.game?.scatterDurationMinMs || 430);
    const durMax = Number(C.game?.scatterDurationMaxMs || 690);
    const delayMax = Number(C.game?.scatterDelayMaxMs || 105);

    // OUT slots fan away from the impact direction; this count is exactly the scenario count.
    targetIds.forEach((id,order)=>{
      const item = roundPool.chukos[id];
      if (!item?.mesh) return;
      const spread = targetIds.length <= 1 ? 0 : (order-(targetIds.length-1)/2) * 0.34;
      const angle = impactAngle + spread + (rng()-0.5)*0.12;
      const metric = outsideMin + (outsideMax-outsideMin)*rng();
      const y = 0.095 + rng()*0.025;
      const targetPosition = worldPointForWhiteMetric(angle,metric,y);
      const distToImpact = Math.hypot(item.mesh.position.x-tp.x,item.mesh.position.z-tp.z);
      flightPlan.push({
        item,index:id,isKhan:false,targeted:true,targetPosition,
        targetRotation:deterministicLandingRotation(scenarioRuntime.seed,id,false),
        delay:Math.min(delayMax,distToImpact*80 + rng()*28),
        duration:durMin + (durMax-durMin)*(0.65+rng()*0.35),
        arc:Number(C.game?.scatterArcOutsideMin||0.26) + (Number(C.game?.scatterArcOutsideMax||0.54)-Number(C.game?.scatterArcOutsideMin||0.26))*rng()
      });
      scenarioRuntime.targetDirections.set(id,angle);
    });

    // IN slots are decided before launch too. They are distributed safely inside the white ring.
    insideIds.forEach((id,order)=>{
      const item = roundPool.chukos[id];
      if (!item?.mesh) return;
      const n = Math.max(1,insideIds.length);
      const base = -Math.PI + (order+0.5)*(Math.PI*2/n);
      const angle = base + (rng()-0.5)*0.20;
      const band = order % 3;
      const bandT = [0.18,0.58,0.96][band];
      const metric = insideMin + (insideMax-insideMin)*bandT + (rng()-0.5)*0.035;
      const y = 0.090 + rng()*0.028;
      const targetPosition = worldPointForWhiteMetric(angle,metric,y);
      const distToImpact = Math.hypot(item.mesh.position.x-tp.x,item.mesh.position.z-tp.z);
      flightPlan.push({
        item,index:id,isKhan:false,targeted:false,targetPosition,
        targetRotation:deterministicLandingRotation(scenarioRuntime.seed,id,false),
        delay:Math.min(delayMax,18 + distToImpact*72 + rng()*30),
        duration:durMin + (durMax-durMin)*(0.25+rng()*0.45),
        arc:Number(C.game?.scatterArcInsideMin||0.12) + (Number(C.game?.scatterArcInsideMax||0.30)-Number(C.game?.scatterArcInsideMin||0.12))*rng()
      });
    });

    // KHAN: normally stays close to centre; only FIVE_KHAN places it outside.
    if (roundPool.khan?.mesh) {
      const targeted = !!plan.khan;
      const angle = targeted ? impactAngle + 0.24 + (rng()-0.5)*0.12 : Math.atan2(roundPool.khan.mesh.position.z-pileZ,roundPool.khan.mesh.position.x-pileX || 0.001);
      const metric = targeted
        ? outsideMin + (outsideMax-outsideMin)*(0.55+0.45*rng())
        : 0.22 + rng()*0.10;
      const targetPosition = worldPointForWhiteMetric(angle,metric,targeted?0.14:0.135);
      flightPlan.push({
        item:roundPool.khan,index:-1,isKhan:true,targeted,targetPosition,
        targetRotation:deterministicLandingRotation(scenarioRuntime.seed,99,true),
        delay:targeted ? 25+rng()*40 : 55+rng()*45,
        duration:targeted ? durMax*0.95 : durMin*0.85,
        arc:targeted ? Number(C.game?.scatterArcOutsideMax||0.54)*0.92 : Number(C.game?.scatterArcInsideMin||0.12)*0.85
      });
    }

    scenarioRuntime.flightPlan = flightPlan;
    scenarioRuntime.scatterStartedAt = 0;
    scenarioRuntime.scatterActive = false;
    scenarioRuntime.scatterComplete = false;
  }

  function startScenarioScatter() {
    if (!scenarioRuntime.active || !scenarioRuntime.flightPlan.length || scenarioRuntime.scatterActive || scenarioRuntime.scatterComplete) return;
    const now = performance.now();
    scenarioRuntime.scatterStartedAt = now;
    scenarioRuntime.scatterActive = true;
    scenarioRuntime.impactAt = now;
    scenarioRuntime.outIds = new Set();
    scenarioRuntime.khanOut = false;

    scenarioRuntime.flightPlan.forEach(entry=>{
      const item=entry.item;
      if (!item?.mesh || !item?.aggregate?.body) return;
      entry.startPosition=item.mesh.position.clone();
      entry.startRotation=item.mesh.rotationQuaternion ? item.mesh.rotationQuaternion.clone() : BABYLON.Quaternion.Identity();
      try {
        item.aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
        item.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
        item.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
        item.aggregate.body.disablePreStep=false;
      } catch (_) {}
    });
  }

  function updateScenarioScatterAnimation() {
    if (!scenarioRuntime.scatterActive || !scenarioRuntime.flightPlan.length) return;
    const elapsed = performance.now()-scenarioRuntime.scatterStartedAt;
    let allDone=true;

    scenarioRuntime.flightPlan.forEach(entry=>{
      const item=entry.item;
      if (!item?.mesh || !entry.startPosition) return;
      const local=(elapsed-entry.delay)/Math.max(1,entry.duration);
      if (local<0) { allDone=false; return; }
      const t=Math.max(0,Math.min(1,local));
      if (t<1) allDone=false;
      const ease=1-Math.pow(1-t,3);
      const start=entry.startPosition;
      const end=entry.targetPosition;
      item.mesh.position.x=start.x+(end.x-start.x)*ease;
      item.mesh.position.z=start.z+(end.z-start.z)*ease;
      item.mesh.position.y=start.y+(end.y-start.y)*ease+Math.sin(Math.PI*t)*entry.arc;
      if (!item.mesh.rotationQuaternion) item.mesh.rotationQuaternion=BABYLON.Quaternion.Identity();
      BABYLON.Quaternion.SlerpToRef(entry.startRotation,entry.targetRotation,ease,item.mesh.rotationQuaternion);
      item.mesh.computeWorldMatrix(true);
    });

    if (!allDone) return;

    scenarioRuntime.flightPlan.forEach(entry=>{
      const item=entry.item;
      if (!item?.mesh || !item?.aggregate?.body) return;
      item.mesh.position.copyFrom(entry.targetPosition);
      item.mesh.rotationQuaternion=entry.targetRotation.clone();
      item.mesh.computeWorldMatrix(true);
      try {
        item.aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
        item.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
        item.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
        item.aggregate.body.disablePreStep=true;
      } catch (_) {}
      if (entry.isKhan) scenarioRuntime.khanOut=!!entry.targeted;
      else if (entry.targeted) scenarioRuntime.outIds.add(entry.index);
    });

    // SAKA also stops once the planned scatter has visibly completed. No later drift.
    freezeItemAtCurrentPosition(roundPool.saka);
    scenarioRuntime.scatterActive=false;
    scenarioRuntime.scatterComplete=true;
    roundPhysicsFrozen=true;
    syncAllGlbVisuals();
  }

  function computePhysicalResult() {
    // For LMS/scenario rounds, "выбито" is not inferred from a random final
    // Havok position. A piece is counted only after it is explicitly marked OUT.
    if (scenarioRuntime.active && scenarioRuntime.plan) {
      return {
        out: scenarioRuntime.outIds.size,
        khanOut: scenarioRuntime.khanOut
      };
    }

    // Fallback for a physics-only round without an LMS scenario.
    const radius = Number(C.game?.resultRadius || 2.22);
    const isOutside = item => !!item?.mesh && Math.hypot(item.mesh.position.x, item.mesh.position.z) > radius;
    return {
      out: roundPool.chukos.filter(isOutside).length,
      khanOut: !!roundPool.khan && isOutside(roundPool.khan)
    };
  }

  function freezeItemAtCurrentPosition(item) {
    if (!item?.aggregate?.body) return;
    const body = item.aggregate.body;
    try {
      body.setLinearVelocity(BABYLON.Vector3.Zero());
      body.setAngularVelocity(BABYLON.Vector3.Zero());
      body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
    } catch (_) {}
  }

  function markScenarioOut(item, index, isKhan=false) {
    if (!item?.mesh || !item?.aggregate?.body || !scenarioRuntime.active) return false;
    const metric = whiteRingMetricForItem(item);
    const markMetric = Number(C.game?.scenarioOutMarkMetric || 1.12);
    if (metric == null || metric < markMetric || item.mesh.position.y > 0.48) return false;

    if (isKhan) {
      if (scenarioRuntime.khanOut) return true;
      scenarioRuntime.khanOut = true;
    } else {
      if (scenarioRuntime.outIds.has(index)) return true;
      scenarioRuntime.outIds.add(index);
    }

    // Once a selected piece has clearly landed outside, freeze it exactly where
    // physics put it. No later teleport and no delayed second movement.
    freezeItemAtCurrentPosition(item);
    return true;
  }

  function keepScenarioNonTargetInside(item) {
    if (!item?.mesh || !item?.aggregate?.body || roundPhysicsFrozen) return;
    const metric = whiteRingMetricForItem(item);
    if (metric == null) return;

    const softMetric = Number(C.game?.scenarioInsideSoftMetric || 0.74);
    if (metric <= softMetric) return;

    const mesh = item.mesh;
    const body = item.aggregate.body;
    const r = Math.hypot(mesh.position.x, mesh.position.z);
    const inv = 1 / Math.max(1e-6, r || 1);
    const nx = mesh.position.x * inv;
    const nz = mesh.position.z * inv;
    const vel = readLinearVelocity(body);
    const speed = Math.hypot(vel.x,vel.y,vel.z);
    const elapsed = scenarioRuntime.impactAt ? performance.now() - scenarioRuntime.impactAt : 0;
    if (elapsed > 260 && speed < 0.10) return;
    const outward = vel.x*nx + vel.z*nz;
    const over = Math.max(0, metric-softMetric);
    const pull = 0.34 + Math.min(1.10, over*3.6);

    let vx = vel.x*0.78 - nx*pull;
    let vz = vel.z*0.78 - nz*pull;
    if (outward > 0) {
      vx -= nx*outward*1.45;
      vz -= nz*outward*1.45;
    }
    try {
      body.setLinearVelocity(new BABYLON.Vector3(vx, Math.min(vel.y,0.20), vz));
    } catch (_) {}
  }

  function freezeRoundPhysics() {
    if (roundPhysicsFrozen) return;
    roundPhysicsFrozen = true;
    [...roundPool.chukos, roundPool.khan, roundPool.saka].filter(Boolean).forEach(freezeItemAtCurrentPosition);
  }

  function finalizeScenarioVisual() {
    // v0.12.1: final positions were chosen BEFORE SAKA launched.
    // Never rearrange anything after the pieces have landed.
    freezeRoundPhysics();
  }

  function showGameResult() {
    if (!roundPool.initialized || gameState.resultShown || !gameState.ticket) return;
    finalizeScenarioVisual();
    const physical = computePhysicalResult();
    const plan = scenarioRuntime.plan || scenarioPlan(gameState.ticket.scenario);
    gameState.resultShown = true;

    if (gameState.pendingBalance != null && Number.isFinite(gameState.pendingBalance)) {
      gameState.balance = Number(gameState.pendingBalance);
      if (gameState.mode === 'demo') gameState.demoBalance = gameState.balance;
      else gameState.realBalance = gameState.balance;
    }

    if (ui.resultMain) ui.resultMain.textContent = plan.khan ? `Выбито: ${plan.regular} + ХАН` : `Выбито: ${plan.regular}`;
    if (ui.resultSub) ui.resultSub.textContent = `Выигрыш: ${formatMoney(gameState.ticket.win || 0)} · ${plan.key}`;
    if (ui.resultCard) {
      ui.resultCard.hidden = false;
      ui.resultCard.classList.toggle('win', Number(gameState.ticket.win || 0) > 0);
    }

    if (physical.out !== plan.regular || physical.khanOut !== plan.khan) {
      console.warn('[CHUKO 0.12.1] scenario visual mismatch after fallback', {physical, plan, ticket:gameState.ticket});
    }

    gameState.phase = 'settled';
    gameState.ticketReady = false;
    gameState.busy = false;
    updateGameHud();
    LMS?.emit?.('X2_GAME_ROUND_COMPLETE', {
      gameId:LMS_CFG.gameId || 'CHUKO',
      ticketId:gameState.ticket.ticketId,
      scenario:gameState.ticket.scenario,
      scenarioKey:plan.key,
      win:Number(gameState.ticket.win || 0),
      balance:gameState.balance,
      denomination:gameState.denomination,
      currency:gameState.currency,
      currencyDisplay:gameState.currencyDisplay,
      language:gameState.language,
      mode:gameState.mode
    });
  }

  async function refreshBalance() {
    try {
      if (gameState.mode === 'demo') {
        gameState.balance = Number(gameState.demoBalance);
      } else {
        const data = await LMS.getBalance({currency:gameState.currency});
        gameState.realBalance = Number(data.balance);
        gameState.balance = gameState.realBalance;
        if (data.currency) gameState.currency = String(data.currency).toUpperCase();
        if (data.currencyDisplay) gameState.currencyDisplay = String(data.currencyDisplay);
      }
      LMS?.emit?.('X2_GAME_BALANCE_LOADED', {gameId:LMS_CFG.gameId || 'CHUKO', balance:gameState.balance, currency:gameState.currency, currencyDisplay:gameState.currencyDisplay, mode:gameState.mode});
    } catch (err) {
      console.error(err);
      gameState.phase = 'error';
      ui.hint.textContent = 'Не удалось загрузить баланс';
      LMS?.emit?.('X2_GAME_ERROR',{stage:'balance',code:err.code||'BALANCE_ERROR',message:err.message||String(err)});
    }
    updateGameHud();
  }

  async function requestNewGame() {
    if (!['idle','settled'].includes(gameState.phase) || gameState.busy) return;
    hideGameResult();
    gameState.busy = true;
    gameState.phase = 'requesting';
    gameState.ticketReady = false;
    gameState.ticket = null;
    clearScenarioRuntime();
    ui.hint.textContent = 'Получаем билет…';
    updateGameHud();
    try {
      const request = {
        gameId:LMS_CFG.gameId || 'CHUKO',
        denomination:gameState.denomination,
        currency:gameState.currency,
        currencyDisplay:gameState.currencyDisplay,
        language:gameState.language,
        demoBalance:gameState.demoBalance
      };
      const data = gameState.mode === 'demo'
        ? await LMS.createDemoTicket(request)
        : await LMS.createTicket(request);
      gameState.ticket = data;
      gameState.pendingBalance = Number(data.balance);
      gameState.denomination = Number(data.denomination ?? gameState.denomination);
      if (data.currency) gameState.currency = String(data.currency).toUpperCase();
      if (data.currencyDisplay) gameState.currencyDisplay = String(data.currencyDisplay);
      prepareScenarioRuntime(data);
      gameState.phase = 'ready';
      gameState.ticketReady = true;
      gameState.busy = false;
      resetRound();
      updateGameHud();
      LMS?.emit?.('X2_GAME_TICKET_READY', {
        gameId:LMS_CFG.gameId || 'CHUKO', ticketId:data.ticketId, scenario:data.scenario, scenarioKey:data.scenarioKey,
        denomination:gameState.denomination, currency:gameState.currency, currencyDisplay:gameState.currencyDisplay,
        language:gameState.language, mode:gameState.mode
      });
    } catch (err) {
      console.error(err);
      gameState.phase = 'idle';
      gameState.busy = false;
      gameState.ticketReady = false;
      gameState.ticket = null;
      const code = err.code || 'GAME_START_ERROR';
      ui.hint.textContent = code === 'INSUFFICIENT_FUNDS' ? 'Недостаточно средств' : 'Не удалось получить билет';
      updateGameHud();
      LMS?.emit?.('X2_GAME_ERROR',{stage:'newGame',code,message:err.message||String(err)});
    }
  }

  async function setGameMode(mode) {
    if (!['idle','settled'].includes(gameState.phase) || gameState.busy) return;
    const next = mode === 'real' ? 'real' : 'demo';
    if (next === 'demo' && !gameState.demoAllowed) return;
    if (next === gameState.mode) return;
    gameState.mode = next;
    gameState.ticket = null;
    gameState.ticketReady = false;
    gameState.pendingBalance = null;
    clearScenarioRuntime();
    hideGameResult();
    resetRound();
    LMS?.emit?.('X2_GAME_MODE_CHANGED',{gameId:LMS_CFG.gameId || 'CHUKO',mode:gameState.mode,currency:gameState.currency,language:gameState.language,denomination:gameState.denomination});
    await refreshBalance();
    gameState.phase = 'idle';
    updateGameHud();
  }

  function bindGameUi() {
    ui.demoModeBtn?.addEventListener('click',()=>setGameMode('demo'));
    ui.realModeBtn?.addEventListener('click',()=>setGameMode('real'));
    renderDenominationButtons();
    updateGameHud();
  }

  async function initializeGameIntegration() {
    if (!LMS || !ScenarioCfg) throw new Error('LMS/scenario modules are not loaded');
    const settings = await LMS.getGameSettings();
    gameState.denominations = Array.isArray(settings.denominations) && settings.denominations.length
      ? settings.denominations.map(Number).filter(v=>Number.isFinite(v)&&v>0)
      : [25,50,100];
    const preferred = Number(settings.denomination ?? gameState.denomination);
    gameState.denomination = gameState.denominations.includes(preferred) ? preferred : gameState.denominations[0];
    gameState.currency = String(settings.currency || 'KGS').toUpperCase();
    gameState.currencyDisplay = String(settings.currencyDisplay || settings.currency || 'сом');
    gameState.language = String(settings.language || 'RU').toUpperCase();
    gameState.mode = String(settings.mode || 'demo').toLowerCase() === 'real' ? 'real' : 'demo';
    gameState.demoAllowed = settings.demoAllowed !== false;
    gameState.demoBalance = Number(settings.demoBalance ?? LMS_CFG.demoBalance ?? 10000);
    gameState.phase = 'idle';
    renderDenominationButtons();
    await refreshBalance();
    resetRound();
    updateGameHud();
    ui.hint.textContent = 'Выберите номинал и нажмите «Новая игра»';
  }

  function resetRound() {
    const resetStartedAt = performance.now();
    window.clearTimeout(resetTimer);
    resetTimer = 0;
    pileReleasedForThrow = false;
    roundPhysicsFrozen = false;
    scenarioRuntime.scatterStartedAt = 0;
    scenarioRuntime.scatterActive = false;
    scenarioRuntime.scatterComplete = false;
    scenarioRuntime.flightPlan = [];
    ensureRoundPool();

    thrown = false;
    roundIndex++;
    roundSeed = roundIndex * 7919 + 17;
    throwState = { active: false, targetPoint: null, guideDir: null, power: 0, impactBoosted: false, flightTime: 0 };
    ui.throwBtn.disabled = false;
    ui.throwBtn.textContent = 'БРОСИТЬ САКА';
    hideGameResult();
    ui.hint.textContent = gameState.ticketReady && gameState.ticket
      ? `Билет #${gameState.ticket.ticketId} · ${gameState.denomination} ${gameState.currencyDisplay} · потяните САКА`
      : 'Выберите номинал и нажмите «Новая игра»';
    ui.hint.style.opacity = '1';
    resetAimState();
    hideAimVisuals();
    if (ui.aimPower) ui.aimPower.hidden = true;
    impactFxState.active = false;
    if (impactFlash) impactFlash.setEnabled(false);

    const positions = pilePositions();
    const d = C.pieces.chuko;
    const pileScale = pilePieceScale();
    positions.forEach(([px, pz], i) => {
      const jitter = C.pile.positionJitter;
      const x = Number(tuning.pileX) + px + (Math.random() - 0.5) * jitter * 2;
      const z = Number(tuning.pileZ) + pz + (Math.random() - 0.5) * jitter * 2;
      const yaw = (i % 2 ? 0.78 : -0.72) + (i % 4 - 1.5) * 0.10;
      const lift = (i % 5 === 0 || i % 7 === 0) ? C.pile.stackLift : 0;
      const rot = BABYLON.Quaternion.FromEulerAngles(
        (Math.random() - 0.5) * C.pile.angleJitter,
        yaw + (Math.random() - 0.5) * C.pile.angleJitter,
        (Math.random() - 0.5) * C.pile.angleJitter
      );
      queueBodyTransformReset(
        roundPool.chukos[i],
        new BABYLON.Vector3(x, d.height * pileScale * 0.58 + lift, z),
        rot,
        false
      );
    });

    const kd = C.pieces.khan;
    applyPilePieceScale();
    queueBodyTransformReset(
      roundPool.khan,
      new BABYLON.Vector3(Number(tuning.pileX), kd.height * 0.54, Number(tuning.pileZ) - 0.01),
      BABYLON.Quaternion.FromEulerAngles(
        (Math.random() - 0.5) * C.pile.angleJitter * 0.45,
        0.58 + (Math.random() - 0.5) * C.pile.angleJitter * 0.45,
        (Math.random() - 0.5) * C.pile.angleJitter * 0.45
      ),
      false
    );

    saka = roundPool.saka.mesh;
    sakaAggregate = roundPool.saka.aggregate;
    queueBodyTransformReset(
      roundPool.saka,
      (() => { const s = throwStartPoint(); return new BABYLON.Vector3(s.x, s.y, s.z); })(),
      BABYLON.Quaternion.FromEulerAngles(0.18, -0.45, 0.12),
      false
    );

    updatePileShadow();
    updateSakaShadow();
    updateBodyCount();

    // Keep the visible default trajectory before the user touches SAKA.
    const defaultGeo = aimGeometry();
    const defaultPoint = { x: defaultGeo.center.x, z: defaultGeo.center.z };
    aimState.power = 0.58;
    aimState.guideDir = defaultGeo.toCenter;
    aimState.targetPoint = defaultPoint;
    updateAimVisuals(defaultPoint, 0.58);

    // Useful while profiling on iPhone: this measures JS reset work only.
    const resetMs = performance.now() - resetStartedAt;
    console.debug(`[CHUKO 0.12.1] pooled reset ${resetMs.toFixed(2)} ms`);
  }

  function ballisticForApex(start, target, power01) {
    const p = clamp01(power01);
    const g = Math.max(0.001, Math.abs(C.physics.gravity));
    const arcMin = Math.max(0.55, Number(C.throw.arcHeightMin || 1.55));
    const arcMax = Math.max(arcMin, Number(C.throw.arcHeightMax || arcMin));
    const arcHeight = arcMin + (arcMax - arcMin) * p;

    const apexY = Math.max(start.y, target.y) + arcHeight;
    const rise = Math.max(0.001, apexY - start.y);
    const fall = Math.max(0.001, apexY - target.y);
    const vy = Math.sqrt(2 * g * rise);
    const tUp = vy / g;
    const tDown = Math.sqrt(2 * fall / g);
    const flightTime = tUp + tDown;

    const horizontal = target.subtract(start);
    horizontal.y = 0;
    const vxz = horizontal.scale(1 / Math.max(0.001, flightTime));
    const velocity = new BABYLON.Vector3(vxz.x, vy, vxz.z);

    return { velocity, flightTime, apexY, arcHeight };
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
    const start = throwStartPoint();
    const origin = { x: start.x, z: start.z };
    const center = { x: Number(tuning.pileX), z: Number(tuning.pileZ) };
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
    const maxPower = Math.max(minPower, Math.min(0.95, Number(C.throw.landingPowerMax || 0.82)));
    const exponent = Math.max(0.35, Number(C.throw.landingPowerExponent || 1));
    const power = clamp01(power01);
    const mapped = minPower + (maxPower - minPower) * Math.pow(power, exponent);
    const t = hits.near + (hits.far - hits.near) * mapped;

    let point = { x: geo.origin.x + safeDir.x * t, z: geo.origin.z + safeDir.z * t };

    // Keep the real impact point inside the dense contact zone of the pile.
    // This prevents back-edge throws from landing behind the last chükö.
    const contactRadius = geo.radius * Math.max(0.30, Math.min(0.95, Number(C.throw.contactRadiusFactor || 0.50)));
    const dx = point.x - geo.center.x;
    const dz = point.z - geo.center.z;
    const r = Math.hypot(dx, dz);
    if (r > contactRadius) {
      const inv = 1 / Math.max(1e-6, r);
      point = { x: geo.center.x + dx * inv * contactRadius, z: geo.center.z + dz * inv * contactRadius };
    }

    return { dir: safeDir, point, power };
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

  function createAimVisuals() {
    aimDotMaterial = new BABYLON.StandardMaterial('aim-dot-mat', scene);
    aimDotMaterial.diffuseColor = new BABYLON.Color3(0.98, 1.00, 0.86);
    aimDotMaterial.emissiveColor = new BABYLON.Color3(0.78, 0.84, 0.18);
    aimDotMaterial.alpha = 0.55;
    aimDotMaterial.disableDepthWrite = true;

    for (let i = 0; i < 14; i++) {
      const dot = BABYLON.MeshBuilder.CreateSphere(`aim-dot-${i}`, {
        diameter: i === 13 ? 0.060 : 0.038,
        segments: 5
      }, scene);
      dot.material = aimDotMaterial;
      dot.isPickable = false;
      dot.renderingGroupId = 2;
      dot.setEnabled(false);
      aimDots.push(dot);
    }

    const targetMat = new BABYLON.StandardMaterial('aim-target-mat', scene);
    targetMat.diffuseColor = new BABYLON.Color3(0.90, 0.94, 0.20);
    targetMat.emissiveColor = new BABYLON.Color3(0.30, 0.34, 0.03);
    targetMat.alpha = 0.72;
    targetMat.disableDepthWrite = true;
    aimTarget = BABYLON.MeshBuilder.CreateTorus('aim-target', {
      diameter: 0.28,
      thickness: 0.022,
      tessellation: 24
    }, scene);
    aimTarget.material = targetMat;
    aimTarget.isPickable = false;
    aimTarget.renderingGroupId = 2;
    aimTarget.setEnabled(false);
  }

  function hideAimVisuals() {
    aimDots.forEach(dot => dot.setEnabled(false));
    if (aimTarget) aimTarget.setEnabled(false);
  }

  function ballisticTargetYForAim() {
    // The marker represents the intended impact/contact point, not the later
    // geometric center position after SAKA has already touched the pile.
    return Number(C.throw.contactAimY || C.throw.targetY || 0.30);
  }

  function correctFinalApproachToAim() {
    if (!throwState.active || pileReleasedForThrow || !throwState.targetPoint || !saka || !sakaAggregate?.body) return;
    const velocity = readLinearVelocity(sakaAggregate.body);
    if (velocity.y >= -0.05) return;

    const contactY = ballisticTargetYForAim();
    const startY = Number(C.throw.finalApproachStartY || 0.98);
    if (saka.position.y > startY || saka.position.y <= contactY - 0.03) return;

    const g = Math.max(0.001, Math.abs(C.physics.gravity));
    const dy = Math.max(0, saka.position.y - contactY);

    // Time until the SAKA centre reaches the real contact plane.
    const disc = velocity.y * velocity.y + 2 * g * dy;
    let t = (velocity.y + Math.sqrt(Math.max(0, disc))) / g;
    if (!Number.isFinite(t) || t <= 0) {
      t = Math.sqrt(Math.max(0.0004, 2 * dy / g));
    }
    t = Math.max(Number(C.throw.finalApproachMinTime || 0.035), t);

    const tp = throwState.targetPoint;
    const maxSpeed = Math.max(1, Number(C.throw.finalApproachMaxSpeed || 7.4));
    let vx = (tp.x - saka.position.x) / t;
    let vz = (tp.z - saka.position.z) / t;
    vx = Math.max(-maxSpeed, Math.min(maxSpeed, vx));
    vz = Math.max(-maxSpeed, Math.min(maxSpeed, vz));

    // Very close to contact, remove the last few centimetres of accumulated
    // numerical/collision error. This is still velocity guidance, not teleporting.
    const horizontalError = Math.hypot(tp.x - saka.position.x, tp.z - saka.position.z);
    if (saka.position.y <= contactY + 0.16 && horizontalError < 0.22) {
      const closeT = Math.max(0.022, t);
      vx = Math.max(-maxSpeed, Math.min(maxSpeed, (tp.x - saka.position.x) / closeT));
      vz = Math.max(-maxSpeed, Math.min(maxSpeed, (tp.z - saka.position.z) / closeT));
    }

    sakaAggregate.body.setLinearVelocity(new BABYLON.Vector3(vx, velocity.y, vz));
  }

  function updateAimVisuals(target2, power) {
    if (!saka || !aimDots.length) return;
    const s0 = throwStartPoint();
    const start = new BABYLON.Vector3(s0.x, s0.y, s0.z);
    const target = new BABYLON.Vector3(target2.x, ballisticTargetYForAim(), target2.z);
    const ballistic = ballisticForApex(start, target, power);
    const flightTime = ballistic.flightTime;
    const v = ballistic.velocity;

    aimDots.forEach((dot, i) => {
      const t = flightTime * ((i + 1) / (aimDots.length + 1));
      const p = start.add(v.scale(t)).add(new BABYLON.Vector3(0, 0.5 * C.physics.gravity * t * t, 0));
      dot.position.copyFrom(p);
      dot.setEnabled(i % 3 === 0 || i === aimDots.length - 1);
    });

    if (aimTarget) {
      aimTarget.position.set(target2.x, 0.055, target2.z);
      aimTarget.scaling.setAll(0.86 + 0.20 * clamp01(power));
      aimTarget.setEnabled(true);
    }
  }

  function resetAimState() {
    aimState = { dragging: false, pointerId: null, power: 0, guideDir: null, targetPoint: null, tapCandidate: false, downX: 0, downY: 0 };
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


  function worldToScreenXZ(x, z, y = 0.05) {
    if (!scene?.activeCamera) return null;
    const viewport = scene.activeCamera.viewport.toGlobal(ui.canvas.clientWidth, ui.canvas.clientHeight);
    return BABYLON.Vector3.Project(
      new BABYLON.Vector3(x, y, z),
      BABYLON.Matrix.Identity(),
      scene.getTransformMatrix(),
      viewport
    );
  }

  // Camera-aware local basis for the aiming disc. This is important on mobile:
  // world +X is not guaranteed to be screen-right for the current ArcRotateCamera.
  function aimScreenBasis() {
    const geo = aimGeometry();
    const forward = { x: geo.toCenter.x, z: geo.toCenter.z };
    let right = { x: -forward.z, z: forward.x };

    const c0 = worldToScreenXZ(geo.center.x, geo.center.z);
    const c1 = worldToScreenXZ(geo.center.x + right.x * 0.35, geo.center.z + right.z * 0.35);
    if (c0 && c1 && c1.x < c0.x) right = { x: -right.x, z: -right.z };

    return { geo, forward, right };
  }

  // Direct 2D aiming: finger displacement moves the landing marker inside the pile disc.
  // Slingshot convention: pull left -> aim right; pull down -> aim farther through the pile.
  function targetPointFromDrag(dx, dy, maxPull) {
    const { geo, forward, right } = aimScreenBasis();
    let lateral = (-dx / Math.max(1, maxPull)) * (C.throw.aimHorizontalSensitivity || 1);
    let depth = (dy / Math.max(1, maxPull)) * (C.throw.aimDepthSensitivity || 1);

    lateral = Math.max(-1, Math.min(1, lateral));
    depth = Math.max(-1, Math.min(1, depth));

    const len = Math.hypot(lateral, depth);
    if (len > 1) {
      lateral /= len;
      depth /= len;
    }

    const r = geo.radius * Math.max(0.2, Math.min(1, C.throw.aimPointRadiusFactor || 0.88));
    return {
      x: geo.center.x + right.x * lateral * r + forward.x * depth * r,
      z: geo.center.z + right.z * lateral * r + forward.z * depth * r
    };
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

    // v0.5 keeps the precise v0.4.2 camera-aware 2D aiming disc.
    // This removes the old non-linear ray/power mapping and fixes horizontal mirroring.
    const targetPoint = targetPointFromDrag(dx, dy, maxPull);
    const geo = aimGeometry();
    const guideDir = normalize2(
      targetPoint.x - geo.origin.x,
      targetPoint.z - geo.origin.z,
      geo.toCenter.x,
      geo.toCenter.z
    );

    aimState.power = power;
    aimState.guideDir = guideDir;
    aimState.targetPoint = targetPoint;
    updateAimVisuals(targetPoint, power);

    // Visual pull of SAKA opposite to the actual throw direction.
    const pullWorld = C.throw.sakaPullWorld * power;
    saka.position.set(
      throwStartPoint().x - guideDir.x * pullWorld,
      C.throw.start.y + 0.025 * power,
      throwStartPoint().z - guideDir.z * pullWorld
    );

    if (ui.aimPower) {
      ui.aimPower.hidden = power < 0.02;
      const strong = ui.aimPower.querySelector('strong');
      if (strong) strong.textContent = `${Math.round(power * 100)}%`;
    }
    ui.hint.textContent = power < 0.08
      ? 'Тяните САКА назад сильнее'
      : 'Отпустите · влево пальцем = прицел вправо';
  }

  function bindAimControls() {
    ui.canvas.addEventListener('pointerdown', (e) => {
      if (thrown || !saka || gameState.phase !== 'ready' || !gameState.ticketReady) return;
      const p = canvasPointer(e);
      aimState.tapCandidate = true;
      aimState.downX = e.clientX;
      aimState.downY = e.clientY;

      if (!isPointerNearSaka(e)) return;

      aimState.dragging = true;
      aimState.pointerId = e.pointerId;
      aimState.power = 0;
      aimState.guideDir = null;
      aimState.targetPoint = null;
      ui.canvas.setPointerCapture?.(e.pointerId);
      ui.hint.textContent = 'Тяните назад: влево пальцем → прицел вправо · дальше — сила';
      e.preventDefault();
    });

    ui.canvas.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - aimState.downX, e.clientY - aimState.downY) > C.throw.tapThresholdPx) {
        aimState.tapCandidate = false;
      }
      if (!aimState.dragging || aimState.pointerId !== e.pointerId || thrown || gameState.phase !== 'ready') return;
      updateDragAim(e);
      e.preventDefault();
    });

    const release = (e) => {
      if (aimState.dragging && aimState.pointerId === e.pointerId) {
        const power = aimState.power;
        const guideDir = aimState.guideDir;
        const targetPoint = aimState.targetPoint;
        aimState.dragging = false;
        aimState.pointerId = null;
        aimState.tapCandidate = false;
        if (ui.aimPower) ui.aimPower.hidden = true;
        if (power < 0.06 || !guideDir || !targetPoint) throwSaka();
        else throwSaka({ guideDir, targetPoint, power, manual: true });
        e.preventDefault();
        return;
      }

      if (aimState.tapCandidate && !thrown && gameState.phase === 'ready' && gameState.ticketReady) {
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
        { const s = throwStartPoint(); saka?.position.set(s.x, s.y, s.z); }
        const geo = aimGeometry();
        const defaultPoint = { x: geo.center.x, z: geo.center.z };
        aimState.targetPoint = defaultPoint;
        updateAimVisuals(defaultPoint, 0.58);
        if (ui.aimPower) ui.aimPower.hidden = true;
        ui.hint.textContent = gameState.ticket ? `Билет #${gameState.ticket.ticketId} · ${gameState.denomination} ${gameState.currencyDisplay} · потяните САКА` : 'Нажмите «Новая игра»';
      }
      aimState.tapCandidate = false;
    });
  }

  function snapLandingPointToNearestChuko(point) {
    if (!C.game?.sakaContactSnapEnabled || !roundPool.initialized || !point) return point;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    roundPool.chukos.forEach((item, index) => {
      if (!item?.mesh) return;
      const d = Math.hypot(item.mesh.position.x - point.x, item.mesh.position.z - point.z);
      if (d < bestDist) { bestDist = d; best = { item, index }; }
    });

    if (!best) return point;
    const maxDist = Number(C.game?.sakaContactSnapMaxDistance || 0.95);
    if (bestDist > maxDist) return point;

    // Aim the SAKA centre directly over the closest real chükö.
    // This guarantees visible contact before the deterministic scatter begins.
    return { x: best.item.mesh.position.x, z: best.item.mesh.position.z };
  }

  function throwSaka(options = {}) {
    if (thrown || !saka || !sakaAggregate || gameState.phase !== 'ready' || !gameState.ticketReady) return;
    thrown = true;
    gameState.phase = 'throwing';
    updateGameHud();
    ui.throwBtn.disabled = true;
    ui.throwBtn.textContent = 'САКА В ПОЛЁТЕ…';
    if (ui.aimPower) ui.aimPower.hidden = true;
    // Keep the selected ring visible during the flight so the exact contact can
    // be checked visually. Only hide the dotted guide.
    aimDots.forEach(dot => dot.setEnabled(false));

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

    let landingPoint;
    if (options.targetPoint) {
      // Manual drag is precise by design: preview ring and ballistic target are the same point.
      // A tiny optional deviation can be enabled later, but defaults to zero for manual aim.
      landingPoint = { x: options.targetPoint.x, z: options.targetPoint.z };
      const dev = Math.max(0, Number(C.throw.manualDeviationMaxDeg || 0)) * Math.PI / 180;
      if (dev > 0) {
        const geo = aimGeometry();
        const baseDir = normalize2(landingPoint.x - geo.origin.x, landingPoint.z - geo.origin.z, geo.toCenter.x, geo.toCenter.z);
        const d = (Math.random() * 2 - 1) * dev;
        const dir = rotate2(baseDir, d);
        const dist = Math.hypot(landingPoint.x - geo.origin.x, landingPoint.z - geo.origin.z);
        landingPoint = { x: geo.origin.x + dir.x * dist, z: geo.origin.z + dir.z * dist };
      }
    } else {
      const actual = actualThrowFromGuide(guideDir, power);
      landingPoint = actual.point;
    }

    // Manual aim must still land inside the dense pile contact zone.
    {
      const geo = aimGeometry();
      const contactRadius = geo.radius * Math.max(0.30, Math.min(0.95, Number(C.throw.contactRadiusFactor || 0.50)));
      const dx = landingPoint.x - geo.center.x;
      const dz = landingPoint.z - geo.center.z;
      const r = Math.hypot(dx,dz);
      if (r > contactRadius) {
        const inv = 1 / Math.max(1e-6,r);
        landingPoint = {x:geo.center.x + dx*inv*contactRadius, z:geo.center.z + dz*inv*contactRadius};
      }
    }

    // Guarantee that SAKA's ballistic contact point coincides with at least one
    // actual chükö position. This avoids visually dropping into an empty gap.
    landingPoint = snapLandingPointToNearestChuko(landingPoint);

    // Scenario result is planned BEFORE SAKA starts flying: exact final landing
    // points for all 12 chükö and KHAN are fixed now and will not change later.
    if (scenarioRuntime.active && C.game?.deterministicScatter !== false) {
      prepareScenarioLandingPlan(landingPoint);
    }

    const target = new BABYLON.Vector3(landingPoint.x, ballisticTargetYForAim(), landingPoint.z);
    const s0 = throwStartPoint();
    const start = new BABYLON.Vector3(s0.x, s0.y, s0.z);
    const ballistic = ballisticForApex(start, target, power);

    throwState = {
      active: true,
      targetPoint: { x: landingPoint.x, z: landingPoint.z },
      guideDir: { x: guideDir.x, z: guideDir.z },
      power,
      impactBoosted: false,
      flightTime: ballistic.flightTime
    };

    ui.hint.textContent = `Удар ${Math.round(power * 100)}% · ждём контакт и разлёт`;

    // Pile remains STATIC after launch; onBeforeRender releases it only when SAKA is almost touching it.
    pileReleasedForThrow = false;

    saka.position.copyFrom(start);
    sakaAggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
    sakaAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
    sakaAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());

    sakaAggregate.body.setLinearVelocity(ballistic.velocity);
    const spin = C.throw.sideSpin * (0.82 + power * 0.36);
    sakaAggregate.body.setAngularVelocity(new BABYLON.Vector3(
      -spin * 0.60,
      spin * 0.24,
      spin
    ));

    resetTimer = window.setTimeout(() => {
      throwState.active = false;
      showGameResult();
      ui.hint.textContent = 'Результат зафиксирован · нажмите «Новая игра»';
    }, C.throw.settleMs);
  }

  function seededNoise(index) {
    let x = (roundSeed + index * 374761393) >>> 0;
    x = (x ^ (x >> 13)) >>> 0;
    x = Math.imul(x, 1274126177) >>> 0;
    x = (x ^ (x >> 16)) >>> 0;
    return (x / 4294967295) * 2 - 1;
  }

  function readLinearVelocity(body) {
    const out = BABYLON.Vector3.Zero();
    try {
      if (body?.getLinearVelocityToRef) {
        body.getLinearVelocityToRef(out);
        return out;
      }
      if (body?.getLinearVelocity) return body.getLinearVelocity() || out;
    } catch (_) {}
    return out;
  }

  function applyImpactBoostIfNeeded() {
    const cfg = C.throw.impactBoost;
    if (!cfg?.enabled || !throwState.active || throwState.impactBoosted || !saka || !throwState.targetPoint) return;

    const tp = throwState.targetPoint;
    const sakaVelocity = readLinearVelocity(sakaAggregate?.body);
    if (sakaVelocity.y > 0.15) return;

    const dxPre = saka.position.x - tp.x;
    const dzPre = saka.position.z - tp.z;
    const distPre = Math.hypot(dxPre, dzPre);
    const triggerHeight = Number(cfg.triggerHeight || 0.72);
    const triggerRadius = Number(cfg.triggerRadius || 0.48);

    // Safety fallback: if the pile has not yet been released but SAKA is already
    // descending into the real impact zone, release it right now so the scatter
    // can still happen in this same frame.
    if (!pileReleasedForThrow && saka.position.y <= triggerHeight && distPre <= triggerRadius) {
      if (!(scenarioRuntime.active && C.game?.deterministicScatter !== false)) setPileBodiesMotionDynamic();
      pileReleasedForThrow = true;
    }
    if (!pileReleasedForThrow) return;

    throwState.impactBoosted = true;
    triggerImpactFx(tp, throwState.power || 0.6);
    if (aimTarget) aimTarget.setEnabled(false);

    if (scenarioRuntime.active && C.game?.deterministicScatter !== false) {
      // No post-impact steering and no late correction. The whole scatter uses
      // the precomputed landing plan prepared before the throw.
      startScenarioScatter();
      return;
    }

    // Physics-only fallback keeps the old Havok impact boost.
    const affectRadius = Math.max(0.35, Number(cfg.affectRadius || 1.24));
    const radialSpeed = Math.max(0, Number(cfg.radialSpeed || 4.35));
    const forwardSpeed = Math.max(0, Number(cfg.forwardSpeed || 1.15));
    const liftSpeed = Math.max(0, Number(cfg.liftSpeed || 1.05));
    const randomSpeed = Math.max(0, Number(cfg.randomSpeed || 0.72));
    const forward = normalize2(throwState.guideDir?.x || 0, throwState.guideDir?.z || -1, 0, -1);

    let affected = 0;
    bodies.forEach((item, index) => {
      if (!item || (item.role !== 'chuko' && item.role !== 'khan') || !item.mesh || !item.aggregate?.body) return;
      const px = item.mesh.position.x - tp.x;
      const pz = item.mesh.position.z - tp.z;
      const dist = Math.hypot(px, pz);
      if (dist > affectRadius) return;

      const falloff = Math.pow(Math.max(0, 1 - dist / affectRadius), 0.58);
      const radial = normalize2(px, pz, seededNoise(index + 7), seededNoise(index + 19));
      const sideX = seededNoise(index + 31);
      const sideZ = seededNoise(index + 47);
      const factor = item.role === 'khan' ? Number(cfg.khanFactor || 0.92) : 1;
      const current = readLinearVelocity(item.aggregate.body);

      const chukoIndex = item.role === 'chuko' ? roundPool.chukos.indexOf(item) : -1;
      const scenarioTarget = item.role === 'khan'
        ? scenarioRuntime.khanTarget
        : scenarioRuntime.targetIds.has(chukoIndex);
      const scenarioFactor = scenarioRuntime.active ? (scenarioTarget ? 2.40 : 0.22) : 1.0;
      const added = new BABYLON.Vector3(
        (radial.x * radialSpeed + forward.x * forwardSpeed + sideX * randomSpeed) * falloff * factor * scenarioFactor,
        liftSpeed * (0.55 + 0.45 * falloff) * factor * (scenarioTarget ? 1.10 : 0.78),
        (radial.z * radialSpeed + forward.z * forwardSpeed + sideZ * randomSpeed) * falloff * factor * scenarioFactor
      );
      item.aggregate.body.setLinearVelocity(current.add(added));

      const spin = 6.5 + 4.5 * falloff;
      item.aggregate.body.setAngularVelocity(new BABYLON.Vector3(
        seededNoise(index + 71) * spin,
        seededNoise(index + 89) * spin * 0.65,
        seededNoise(index + 103) * spin
      ));
      affected++;
    });

    if (scenarioRuntime.active && scenarioRuntime.plan) {
      scenarioRuntime.targetIds.forEach(index => {
        const item = roundPool.chukos[index];
        if (!item?.aggregate?.body) return;
        const angle = scenarioRuntime.targetDirections.get(index) ?? 0;
        const dx = Math.cos(angle), dz = Math.sin(angle);
        const vel = readLinearVelocity(item.aggregate.body);
        const outward = vel.x*dx + vel.z*dz;
        const desired = 3.05 + Math.max(0, 3-Number(scenarioRuntime.plan.regular||0))*0.10;
        const add = Math.max(0, desired-outward);
        try {
          item.aggregate.body.setLinearVelocity(new BABYLON.Vector3(
            vel.x + dx*add,
            Math.max(vel.y, 0.28),
            vel.z + dz*add
          ));
        } catch (_) {}
      });

      if (scenarioRuntime.khanTarget && roundPool.khan?.aggregate?.body) {
        const body = roundPool.khan.aggregate.body;
        const vel = readLinearVelocity(body);
        const pileX = Number(tuning.pileX||0), pileZ = Number(tuning.pileZ||0);
        let dx = roundPool.khan.mesh.position.x-pileX;
        let dz = roundPool.khan.mesh.position.z-pileZ;
        const len = Math.hypot(dx,dz) || 1;
        dx/=len; dz/=len;
        const outward = vel.x*dx+vel.z*dz;
        const add = Math.max(0,2.90-outward);
        try { body.setLinearVelocity(new BABYLON.Vector3(vel.x+dx*add,Math.max(vel.y,0.26),vel.z+dz*add)); } catch (_) {}
      }
    }

    ui.hint.textContent = affected
      ? `Контакт · затронуто ${affected} чүкө`
      : 'Контакт · Havok';
  }

  function updateBodyCount() {
    ui.bodyCount.textContent = String(bodies.length);
  }

  function clampChukoInsideView(item, nx, nz, clampRadius, clampY = null) {
    if (!item?.aggregate?.body || !item?.mesh || chukoClampPending.has(item)) return;
    chukoClampPending.add(item);
    const body = item.aggregate.body;
    const mesh = item.mesh;
    const rot = mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : BABYLON.Quaternion.Identity();
    const y = clampY == null ? Math.max(0.08, Math.min(mesh.position.y, 0.92)) : clampY;

    try {
      body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
      body.setLinearVelocity(BABYLON.Vector3.Zero());
      body.setAngularVelocity(BABYLON.Vector3.Zero());
      body.disablePreStep = false;
      mesh.position.set(nx * clampRadius, y, nz * clampRadius);
      mesh.rotationQuaternion = rot;
      mesh.computeWorldMatrix(true);

      scene.onAfterRenderObservable.addOnce(() => {
        try {
          body.disablePreStep = true;
          body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
          body.setLinearVelocity(new BABYLON.Vector3(-nx * 0.18, 0, -nz * 0.18));
          body.setAngularVelocity(BABYLON.Vector3.Zero());
        } catch (_) {}
        chukoClampPending.delete(item);
      });
    } catch (_) {
      chukoClampPending.delete(item);
    }
  }

  function projectPieceToScreen(mesh) {
    if (!scene?.activeCamera || !engine || !mesh) return null;
    try {
      return BABYLON.Vector3.Project(
        mesh.getAbsolutePosition(),
        BABYLON.Matrix.Identity(),
        scene.getTransformMatrix(),
        scene.activeCamera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
      );
    } catch (_) {
      return null;
    }
  }


  function renderPointToCss(point) {
    if (!point || !ui.canvas || !engine) return null;
    const rect = ui.canvas.getBoundingClientRect();
    const rw = Math.max(1, engine.getRenderWidth());
    const rh = Math.max(1, engine.getRenderHeight());
    return {
      x: rect.left + point.x * rect.width / rw,
      y: rect.top + point.y * rect.height / rh
    };
  }

  function projectWorldToCss(position) {
    if (!scene?.activeCamera || !engine || !position) return null;
    try {
      const p = BABYLON.Vector3.Project(
        position,
        BABYLON.Matrix.Identity(),
        scene.getTransformMatrix(),
        scene.activeCamera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
      );
      return renderPointToCss(p);
    } catch (_) {
      return null;
    }
  }

  function whiteRingCssGeometry() {
    const el = ui.fieldPhoto || document.querySelector('.field-photo');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      cx: rect.left + rect.width * Number(C.game?.whiteRingCx || 0.5051),
      cy: rect.top + rect.height * Number(C.game?.whiteRingCy || 0.4697),
      rx: rect.width * Number(C.game?.whiteRingRx || 0.2948),
      ry: rect.height * Number(C.game?.whiteRingRy || 0.2260)
    };
  }

  function whiteRingMetricForWorld(position) {
    const p = projectWorldToCss(position);
    const ring = whiteRingCssGeometry();
    if (!p || !ring || ring.rx <= 1 || ring.ry <= 1) return null;
    return Math.hypot((p.x - ring.cx) / ring.rx, (p.y - ring.cy) / ring.ry);
  }

  function whiteRingMetricForItem(item) {
    if (!item?.mesh) return null;
    return whiteRingMetricForWorld(item.mesh.getAbsolutePosition());
  }

  function containSakaInsidePlayCircle() {
    if (roundPhysicsFrozen || !thrown || !saka || !sakaAggregate?.body || sakaClampPending) return;

    // Do not interfere with the high arc. Clamp only when SAKA is already near/after landing.
    if (saka.position.y > 0.72) return;

    const body = sakaAggregate.body;
    const r = Math.hypot(saka.position.x, saka.position.z);
    const softRadius = Number(C.game?.sakaContainSoftRadius || 2.02);
    const hardRadius = Number(C.game?.sakaContainHardRadius || 2.14);
    const clampRadius = Number(C.game?.sakaContainClampRadius || 1.98);
    const minY = Number(C.game?.sakaContainMinY || 0.12);
    if (r <= softRadius) return;

    const inv = 1 / Math.max(1e-6, r);
    const nx = saka.position.x * inv;
    const nz = saka.position.z * inv;
    const vel = readLinearVelocity(body);
    const outward = vel.x * nx + vel.z * nz;

    // Soft containment near the white circle.
    if (r < hardRadius) {
      let vx = vel.x * 0.92;
      let vz = vel.z * 0.92;
      let vy = vel.y;
      if (outward > 0) {
        vx -= nx * (outward * 1.30 + 0.18);
        vz -= nz * (outward * 1.30 + 0.18);
      }
      if (saka.position.y < minY && vy < 0) vy = 0;
      try { body.setLinearVelocity(new BABYLON.Vector3(vx, vy, vz)); } catch (_) {}
      return;
    }

    // Hard guarantee: SAKA never leaves the visible white play circle.
    sakaClampPending = true;
    const rot = saka.rotationQuaternion ? saka.rotationQuaternion.clone() : BABYLON.Quaternion.Identity();
    const y = Math.max(minY, Math.min(saka.position.y, 0.46));
    try {
      body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
      body.setLinearVelocity(BABYLON.Vector3.Zero());
      body.setAngularVelocity(BABYLON.Vector3.Zero());
      body.disablePreStep = false;
      saka.position.set(nx * clampRadius, y, nz * clampRadius);
      saka.rotationQuaternion = rot;
      saka.computeWorldMatrix(true);
      scene.onAfterRenderObservable.addOnce(() => {
        try {
          body.disablePreStep = true;
          body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
          body.setLinearVelocity(new BABYLON.Vector3(-nx * 0.28, 0, -nz * 0.28));
          body.setAngularVelocity(BABYLON.Vector3.Zero());
        } catch (_) {}
        sakaClampPending = false;
      });
    } catch (_) {
      sakaClampPending = false;
    }
  }

  function containScatterInView() {
    if (roundPhysicsFrozen || !roundPool.initialized || !thrown) return;
    if (scenarioRuntime.active && C.game?.deterministicScatter !== false) return;

    // IMPORTANT: only chükö and KHAN are constrained here. SAKA is never touched,
    // so its ballistic trajectory and Havok flight remain exactly as in v0.8.19.
    const items = [...roundPool.chukos, roundPool.khan].filter(Boolean);
    const softRadius = 2.72;
    const hardRadius = 2.94;
    const absoluteRadius = 3.08;
    const clampRadius = 2.82;
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();

    for (const item of items) {
      const body = item?.aggregate?.body;
      const mesh = item?.mesh;
      if (!body || !mesh) continue;

      const r = Math.hypot(mesh.position.x, mesh.position.z);
      const inv = 1 / Math.max(1e-6, r || 1);
      const nx = mesh.position.x * inv;
      const nz = mesh.position.z * inv;
      const screen = projectPieceToScreen(mesh);

      const visuallyOutside = screen && (
        screen.x < w * 0.055 || screen.x > w * 0.945 ||
        screen.y < h * 0.055 || screen.y > h * 0.895
      );

      // Absolute guarantee: if a chükö reaches the visual border or leaves the
      // safe world radius, return that CHÜKÖ only. No physics wall exists for SAKA.
      if (visuallyOutside || r >= absoluteRadius) {
        clampChukoInsideView(item, nx, nz, clampRadius);
        continue;
      }

      const vel = readLinearVelocity(body);

      // Limit rare upward launches without changing the normal scatter.
      if (mesh.position.y > 1.32 && vel.y > 0) {
        body.setLinearVelocity(new BABYLON.Vector3(vel.x * 0.82, -0.22, vel.z * 0.82));
        continue;
      }

      if (r <= softRadius) continue;
      const outward = vel.x * nx + vel.z * nz;
      let vx = vel.x * 0.86;
      let vz = vel.z * 0.86;
      let vy = Math.min(vel.y, 0.48);

      if (outward > 0) {
        const strength = r >= hardRadius ? 1.55 : 1.18;
        vx -= nx * outward * strength;
        vz -= nz * outward * strength;
      }
      if (r >= hardRadius) {
        const pull = (r - hardRadius + 0.03) * 5.0;
        vx -= nx * pull;
        vz -= nz * pull;
      }
      body.setLinearVelocity(new BABYLON.Vector3(vx, vy, vz));
    }
  }

  function enforceScenarioDuringScatter() {
    if (scenarioRuntime.active && C.game?.deterministicScatter !== false) {
      updateScenarioScatterAnimation();
    }
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
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance'
    });
    configureRenderScale();

    scene = new BABYLON.Scene(engine);
    scene.skipPointerMovePicking = true;
    scene.performancePriority = BABYLON.ScenePerformancePriority.Intermediate;

    await initPhysics();
    createEnvironment();
    await loadGlbModels();
    createAimVisuals();
    bindTuner();
    bindGameUi();
    applyCameraTuning();
    applyPilePieceScale();
    resetRound();
    await initializeGameIntegration();

    scene.onBeforeRenderObservable.add(() => {
      syncAllGlbVisuals();
      updateShadowHelpers();
      updateImpactFx(engine.getDeltaTime() * 0.001);
      correctFinalApproachToAim();
      releasePileIfImpactIsImminent();
      applyImpactBoostIfNeeded();
      containScatterInView();
      enforceScenarioDuringScatter();
      containSakaInsidePlayCircle();
      if (saka && saka.position.y < -2.5) {
        throwState.active = false;
        pileReleasedForThrow = false;
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
      if (gameState.phase === 'ready' && gameState.ticketReady && !thrown) throwSaka();
    });
    ui.resetBtn.addEventListener('click', requestNewGame);
    bindAimControls();

    updatePerf();
  }

  boot().catch(showFatal);
})();
