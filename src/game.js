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
  let aimState = { dragging: false, pointerId: null, power: 0, guideDir: null, targetPoint: null, tapCandidate: false, downX: 0, downY: 0 };
  let throwState = { active: false, targetPoint: null, guideDir: null, power: 0, impactBoosted: false, flightTime: 0 };
  let roundSeed = 1;
  // v0.8.2: dynamic round objects are created once and reused on every reset.
  // This avoids rebuilding convex hulls/materials/shadow casters when the player taps «ЕЩЁ БРОСОК».
  const roundPool = { initialized: false, chukos: [], khan: null, saka: null };
  let prestepRestoreScheduled = false;
  const prestepRestoreQueue = [];

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
    const tex = new BABYLON.DynamicTexture('sky-gradient', { width: 16, height: size }, scene, false);
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0.0, '#111111');
    grad.addColorStop(0.65, '#1e1c1b');
    grad.addColorStop(1.0, '#2b2725');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, size);
    tex.update(false);
    tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    return tex;
  }

  function createBackdropPhoto() {
    // Use the uploaded v20.61 background almost literally.
    const aspect = 941 / 1672;
    const height = 19.6;
    const width = height * aspect;
    const plane = BABYLON.MeshBuilder.CreatePlane('photo-backdrop', { width, height }, scene);
    plane.position.set(-1.10, 4.55, -12.3);
    plane.rotation.y = 0.0;
    plane.isPickable = false;

    const tex = new BABYLON.Texture('assets/background-realistic.webp', scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    const mat = new BABYLON.StandardMaterial('photo-backdrop-mat', scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.disableLighting = true;
    mat.specularColor = BABYLON.Color3.Black();
    mat.fogEnabled = false;
    plane.material = mat;
    freezeStatic(plane);

    // Soften the lower seam while preserving the original art.
    const fadeTex = new BABYLON.DynamicTexture('backdrop-fade-tex', { width: 8, height: 256 }, scene, false);
    const fctx = fadeTex.getContext();
    const grad = fctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, 'rgba(0,0,0,0.0)');
    grad.addColorStop(0.7, 'rgba(10,8,7,0.08)');
    grad.addColorStop(1.0, 'rgba(10,8,7,0.22)');
    fctx.fillStyle = grad;
    fctx.fillRect(0, 0, 8, 256);
    fadeTex.update(false);
    const fadeMat = new BABYLON.StandardMaterial('backdrop-fade-mat', scene);
    fadeMat.diffuseTexture = fadeTex;
    fadeMat.opacityTexture = fadeTex;
    fadeMat.disableLighting = true;
    fadeMat.emissiveColor = new BABYLON.Color3(0.04, 0.03, 0.02);
    fadeMat.backFaceCulling = false;
    fadeMat.fogEnabled = false;
    const fade = BABYLON.MeshBuilder.CreatePlane('photo-backdrop-fade', { width: width * 1.02, height: height * 0.22 }, scene);
    fade.position.set(-1.10, -2.1, -12.2);
    fade.material = fadeMat;
    fade.isPickable = false;
    freezeStatic(fade);
    return plane;
  }

  function createFieldVisual() {
    // Field from v20.61 is used directly as the main arena image.
    const aspect = 1448 / 1086;
    const width = 6.35;
    const height = width / aspect;
    const plane = BABYLON.MeshBuilder.CreatePlane('field-visual', { width, height }, scene);
    plane.position.set(0.00, 0.52, -1.55);
    plane.isPickable = false;
    plane.renderingGroupId = 0;

    const tex = new BABYLON.Texture('assets/field-realistic.webp', scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    const mat = new BABYLON.StandardMaterial('field-visual-mat', scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.opacityTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.specularColor = BABYLON.Color3.Black();
    plane.material = mat;
    freezeStatic(plane);
    return plane;
  }

  function createEnvironment() {
    scene.clearColor = new BABYLON.Color4(0.01, 0.01, 0.01, 1);

    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.0;
    scene.imageProcessingConfiguration.contrast = 1.02;

    scene.fogMode = BABYLON.Scene.FOGMODE_NONE;

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
    camera.fov = 0.67;

    const skyTex = createSkyGradientTexture();
    const skyMat = new BABYLON.StandardMaterial('sky-mat', scene);
    skyMat.disableLighting = true;
    skyMat.emissiveTexture = skyTex;
    skyMat.backFaceCulling = false;
    skyMat.fogEnabled = false;
    const sky = BABYLON.MeshBuilder.CreateSphere('sky', {
      diameter: 34,
      segments: isMobile() ? 12 : 18,
      sideOrientation: BABYLON.Mesh.BACKSIDE
    }, scene);
    sky.material = skyMat;
    sky.infiniteDistance = true;
    sky.isPickable = false;
    sky.applyFog = false;
    skyMat.freeze();

    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.1, 1, -0.05), scene);
    hemi.intensity = 0.85;
    hemi.diffuse = new BABYLON.Color3(0.95, 0.89, 0.80);
    hemi.groundColor = new BABYLON.Color3(0.25, 0.18, 0.11);

    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.48, -1, 0.30), scene);
    sun.position = new BABYLON.Vector3(5, 8, -7);
    sun.intensity = 1.65;
    sun.diffuse = new BABYLON.Color3(1.0, 0.83, 0.62);

    const shadowMapSize = isMobile() ? 512 : 1024;
    const shadows = new BABYLON.ShadowGenerator(shadowMapSize, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.0018;
    scene.metadata = { shadows };

    createBackdropPhoto();
    createFieldVisual();

    // Only invisible collision geometry remains 3D here. Visual field comes from the uploaded image.
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

    // Far-below safety ground: invisible during play, only catches pieces that fully leave the arena.
    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 25, height: 25 }, scene);
    ground.position.y = -3.2;
    ground.isVisible = false;
    freezeStatic(ground);

    const groundPhysicsMesh = BABYLON.MeshBuilder.CreateBox('ground-physics', { width: 25, depth: 25, height: 0.18 }, scene);
    groundPhysicsMesh.position.y = -3.3;
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
    bodies.push({ mesh, aggregate, role: isKhan ? 'khan' : 'chuko' });
    return { mesh, aggregate };
  }

  // v0.8.2 pooling/reset -------------------------------------------------------
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

    const sd = C.pieces.saka;
    const sakaMat = material('saka-mat', new BABYLON.Color3(0.018, 0.16, 0.62), 0.20, 0.54);
    sakaMat.clearCoat.isEnabled = true;
    sakaMat.clearCoat.intensity = 0.78;
    sakaMat.clearCoat.roughness = 0.19;
    const sakaMesh = makeSakaBone('SAKA', sd, sakaMat);
    sakaMesh.position.set(C.throw.start.x, C.throw.start.y, C.throw.start.z);
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
    bodies.push({ mesh: sakaMesh, aggregate, role: 'saka' });
    roundPool.saka = { mesh: sakaMesh, aggregate };

    roundPool.initialized = true;
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
    const resetStartedAt = performance.now();
    window.clearTimeout(resetTimer);
    resetTimer = 0;
    ensureRoundPool();

    thrown = false;
    roundIndex++;
    roundSeed = roundIndex * 7919 + 17;
    throwState = { active: false, targetPoint: null, guideDir: null, power: 0, impactBoosted: false, flightTime: 0 };
    ui.throwBtn.disabled = false;
    ui.throwBtn.textContent = 'БРОСИТЬ САКА';
    ui.hint.textContent = 'v0.8.2 · pooled reset · потяните синюю САКА назад и отпустите';
    ui.hint.style.opacity = '1';
    resetAimState();
    hideAimVisuals();
    if (ui.aimPower) ui.aimPower.hidden = true;

    const positions = pilePositions();
    const d = C.pieces.chuko;
    positions.forEach(([px, pz], i) => {
      const jitter = C.pile.positionJitter;
      const x = px + (Math.random() - 0.5) * jitter * 2;
      const z = C.pile.offsetZ + pz + (Math.random() - 0.5) * jitter * 2;
      const yaw = (i % 2 ? 0.78 : -0.72) + (i % 4 - 1.5) * 0.10;
      const lift = (i % 5 === 0 || i % 7 === 0) ? C.pile.stackLift : 0;
      const rot = BABYLON.Quaternion.FromEulerAngles(
        (Math.random() - 0.5) * C.pile.angleJitter,
        yaw + (Math.random() - 0.5) * C.pile.angleJitter,
        (Math.random() - 0.5) * C.pile.angleJitter
      );
      queueBodyTransformReset(
        roundPool.chukos[i],
        new BABYLON.Vector3(x, d.height * 0.58 + lift, z),
        rot,
        true
      );
    });

    const kd = C.pieces.khan;
    queueBodyTransformReset(
      roundPool.khan,
      new BABYLON.Vector3(0.0, kd.height * 0.54, C.pile.offsetZ - 0.01),
      BABYLON.Quaternion.FromEulerAngles(
        (Math.random() - 0.5) * C.pile.angleJitter * 0.45,
        0.58 + (Math.random() - 0.5) * C.pile.angleJitter * 0.45,
        (Math.random() - 0.5) * C.pile.angleJitter * 0.45
      ),
      true
    );

    saka = roundPool.saka.mesh;
    sakaAggregate = roundPool.saka.aggregate;
    queueBodyTransformReset(
      roundPool.saka,
      new BABYLON.Vector3(C.throw.start.x, C.throw.start.y, C.throw.start.z),
      BABYLON.Quaternion.FromEulerAngles(0.18, -0.45, 0.12),
      false
    );

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
    console.debug(`[CHUKO 0.8.2] pooled reset ${resetMs.toFixed(2)} ms`);
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

  function updateAimVisuals(target2, power) {
    if (!saka || !aimDots.length) return;
    const start = new BABYLON.Vector3(C.throw.start.x, C.throw.start.y, C.throw.start.z);
    const target = new BABYLON.Vector3(target2.x, C.throw.targetY, target2.z);
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
      aimTarget.position.set(target2.x, 0.045, target2.z);
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
      : 'Отпустите · влево пальцем = прицел вправо';
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
      aimState.targetPoint = null;
      ui.canvas.setPointerCapture?.(e.pointerId);
      ui.hint.textContent = 'Тяните назад: влево пальцем → прицел вправо · дальше — сила';
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
        const geo = aimGeometry();
        const defaultPoint = { x: geo.center.x, z: geo.center.z };
        aimState.targetPoint = defaultPoint;
        updateAimVisuals(defaultPoint, 0.58);
        if (ui.aimPower) ui.aimPower.hidden = true;
        ui.hint.textContent = 'v0.8.2 · потяните синюю САКА назад и отпустите';
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

    const target = new BABYLON.Vector3(landingPoint.x, C.throw.targetY, landingPoint.z);
    const start = new BABYLON.Vector3(C.throw.start.x, C.throw.start.y, C.throw.start.z);
    const ballistic = ballisticForApex(start, target, power);

    throwState = {
      active: true,
      targetPoint: { x: landingPoint.x, z: landingPoint.z },
      guideDir: { x: guideDir.x, z: guideDir.z },
      power,
      impactBoosted: false,
      flightTime: ballistic.flightTime
    };

    ui.hint.textContent = `Удар ${Math.round(power * 100)}% · сверху в точку · Havok`;

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
      ui.throwBtn.disabled = false;
      ui.throwBtn.textContent = 'ЕЩЁ БРОСОК';
      throwState.active = false;
      ui.hint.textContent = 'v0.8.2 · pooled reset · «Ещё бросок» без пересоздания Havok-тел';
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
    const dx = saka.position.x - tp.x;
    const dz = saka.position.z - tp.z;
    const horizontalDistance = Math.hypot(dx, dz);
    if (saka.position.y > Number(cfg.triggerHeight || 0.72) || horizontalDistance > Number(cfg.triggerRadius || 0.48)) return;

    const sakaVelocity = readLinearVelocity(sakaAggregate?.body);
    if (sakaVelocity.y > 0.15) return;

    throwState.impactBoosted = true;
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

      const added = new BABYLON.Vector3(
        (radial.x * radialSpeed + forward.x * forwardSpeed + sideX * randomSpeed) * falloff * factor,
        liftSpeed * (0.55 + 0.45 * falloff) * factor,
        (radial.z * radialSpeed + forward.z * forwardSpeed + sideZ * randomSpeed) * falloff * factor
      );
      item.aggregate.body.setLinearVelocity(current.add(added));

      const spin = 8.0 + 6.0 * falloff;
      item.aggregate.body.setAngularVelocity(new BABYLON.Vector3(
        seededNoise(index + 71) * spin,
        seededNoise(index + 89) * spin * 0.65,
        seededNoise(index + 103) * spin
      ));
      affected++;
    });

    ui.hint.textContent = affected
      ? `Контакт · импульс передан ${affected} чүкө · смотрим дальность`
      : 'Контакт · Havok';
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
      applyImpactBoostIfNeeded();
      if (saka && saka.position.y < -2.5) {
        throwState.active = false;
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
