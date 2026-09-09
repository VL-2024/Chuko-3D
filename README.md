# CHUKO Modern 3D v0.6

Babylon.js + Havok mobile prototype based on the throw/impact feel of ЧҮКӨ v20.61. LMS is intentionally disconnected.

## Main change in v0.6 — first visual 3D pass

- Replaced the v0.5 sphere/blob proxy with a **single procedural organic loft mesh** for every чүкө, ХАН and САКА.
- The new silhouette has a narrow waist, fuller rounded ends and slight asymmetry, so it reads much closer to an astragalus bone while remaining very light for mobile.
- Physics stays `CONVEX_HULL`: one collider per physical piece. Decorative details are children and do not complicate Havok collisions.
- Regular чүкө now use warm bone/wood-like PBR materials instead of white test material.
- ХАН is larger and gold, with a dark enamel-like top insert and a gold crest.
- САКА is larger, deep blue and glossy, with simple gold decorative details based on the approved blue/gold visual direction.
- Added ACES tone mapping, slightly warmer directional light, improved contrast and a subtle inset playing surface.
- Shadows remain mobile-friendly; no heavy textures, HDR environment or GLB assets yet.
- **Aiming, ballistic arc, impact boost and scatter values from v0.5 are intentionally preserved.**

## What to check on iPhone

1. FPS: target is still ~60 FPS.
2. Make sure the new organic pieces look clearly better than the pearl/blob shapes from v0.5.
3. Check whether ХАН is immediately distinguishable inside the pile.
4. Check whether blue/gold САКА remains easy to see at the start and during aiming.
5. Confirm that aiming accuracy, arc and scatter feel the same as v0.5.
6. Watch the FPS specifically during impact, when all bodies tumble and shadows move at once.

## Performance strategy

The visual mesh is intentionally low-poly on mobile:

- 8 longitudinal rings × 14 radial segments per organic body on mobile;
- 11 × 18 on desktop;
- one `CONVEX_HULL` physics body per piece;
- 512 px shadow map on mobile;
- no real-time reflections / HDR / SSAO / post-processing stack;
- device pixel ratio remains capped at 1.45× with the existing automatic fallback.

These values can be adjusted in `src/config.js -> visual` after the iPhone test.

## Still intentionally excluded

- LMS / tickets / balance;
- scenario-controlled result layer;
- payout UI and autoplay;
- final artist-made GLB/GLTF models and final textures;
- final field/environment / Kyrgyz landscape;
- sound/music.

If Safari caches an older build, open the page with `?v=06`.
