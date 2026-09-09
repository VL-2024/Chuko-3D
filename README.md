# CHUKO Modern 3D v0.5

Babylon.js + Havok mobile prototype based on the throw/impact feel of ЧҮКӨ v20.61. LMS is still intentionally disconnected.

## What changed after v0.4.2

- The manual aiming scheme from v0.4.2 is kept: pull left -> landing point moves right; the marker moves directly inside the pile aiming zone.
- The throw now uses an **apex-height ballistic calculation** instead of a simple fixed flight-time range. The dotted guide and the real Havok launch use the same formula.
- SAKA rises clearly above the field and then descends into the selected landing point from above.
- SAKA mass increased slightly; chuko friction/mass reduced slightly to get a stronger physical response.
- Added a configurable **contact impact boost** at the real landing point. It is not a lottery/scenario ejector: it does not choose winners or target pieces. It only transfers extra radial/forward/upward velocity to nearby physical bodies once, at impact, similar in purpose to `impactBoost` in v20.61.
- Nearby chuko get additional angular velocity, so the scatter should include more visible tumbling rather than only sliding.
- The impact parameters are all in `src/config.js -> throw.impactBoost`, so the next tuning pass can be done quickly without rewriting mechanics.
- Version badge/cache parameters updated to `v0.5`.

## What to check on iPhone

1. FPS should remain near the already confirmed 60 FPS.
2. During aiming, the yellow landing ring should still track the finger accurately.
3. The dotted trajectory should rise higher and visibly fall down into the pile.
4. The actual SAKA impact should correspond to the selected ring.
5. Scatter should be clearly larger than v0.4.2: some chuko should travel toward the outer half of the field and tumble naturally.
6. Check that the scatter is energetic but not like a simultaneous artificial explosion of all pieces.

## Main tuning values

`src/config.js`:

- `throw.arcHeightMin / arcHeightMax` — visible/physical arc height;
- `throw.impactBoost.affectRadius` — radius around the actual landing point that receives extra impact energy;
- `radialSpeed` — radial scatter component;
- `forwardSpeed` — smaller component in the direction of SAKA travel;
- `liftSpeed` — how much pieces pop upward;
- `randomSpeed` — asymmetry/irregularity;
- `pieces.*.mass`, `physics.friction`, `fieldFriction` — base Havok behavior.

## Still intentionally excluded

- LMS / real tickets;
- scenario-controlled ejection count;
- payout/result UI;
- autoplay;
- final GLB/GLTF chuko/KHAN/SAKA models;
- final field/environment art;
- sound/music.

If Safari caches an older build, open the page with `?v=05`.
