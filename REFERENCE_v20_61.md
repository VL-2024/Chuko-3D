# ЧҮКӨ v20.61 -> Modern 3D v0.5 reference

The 2D v20.61 build remains the mechanical reference, but this prototype replaces Pixi/Matter movement with Babylon.js + Havok 3D physics.

## Already carried over conceptually

- 12 regular chuko plus KHAN in a compact pile;
- SAKA starts outside/in front of the pile;
- slingshot-style aiming;
- aiming restricted to a zone that intersects the pile rather than empty field;
- pull amount controls throw strength;
- visible upper arc and top-down landing;
- manual aim has no random deviation;
- stronger scatter at the contact area;
- SAKA/chuko/KHAN remain independent physical bodies after contact.

## v20.61 values that inspired v0.5

v20.61 used, among other tuning values:

- `impactBoost: 1.22`
- `impactRadialFromContact: 10.2`
- `impactForwardShare: 0.22`
- `impactRandomScatter: 2.6`
- `sakaFlightArcHeight: 190`
- `sakaAirborneNoCollision: true`

The numerical units cannot be copied 1:1 because v20.61 is a 2D pixel/Matter world while v0.5 is a meter-like Babylon/Havok 3D world. The **behavioral intent** is copied instead.

## Important difference

v20.61 eventually has scenario-controlled visual results because it is a lottery game. v0.5 still has **no scenario layer**. The new contact boost does not select which pieces must leave the field; it only strengthens the local physical impact near the real landing point.

The next stage, after the physical feel is accepted, is to replace procedural proxy bones with proper 3D assets while preserving this physics/aiming layer.
