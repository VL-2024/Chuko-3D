# ЧҮКӨ v20.61 -> Modern 3D v0.6.1 reference

The 2D v20.61 build remains the mechanical reference. Modern 3D replaces Pixi/Matter movement with Babylon.js + Havok while preserving the approved interaction principles.

## Mechanical principles already carried over

- 12 regular чүкө plus ХАН in a compact pile;
- САКА starts outside/in front of the pile;
- slingshot-style aiming;
- pull left -> aim right;
- aiming restricted to a zone that intersects the pile rather than empty field;
- pull amount controls throw strength;
- visible upper arc and top-down landing;
- preview and real ballistic launch use the same target point/formula;
- manual aim has no random landing deviation;
- stronger local scatter at the actual contact area;
- САКА / чүкө / ХАН remain independent Havok bodies after contact.

## Visual direction added in v0.6

The approved 2D/reference direction contains three distinct classes:

- ordinary чүкө — natural warm bone/wood tones;
- ХАН — premium gold/dark ornamental treatment;
- САКА — saturated blue with gold accents.

v0.6 does **not** yet use final sculpted GLB models. Instead it uses a lightweight organic procedural mesh so we can validate the visual complexity and mobile FPS before committing to final assets.

## Physics note

The contact boost still does not select a lottery outcome and does not decide which specific pieces must leave the circle. It only strengthens the local physical impact. Scenario-controlled results will be layered on later, after the 3D physical/visual base is accepted.

## Next visual stage after acceptance

If v0.6 remains close to 60 FPS, the next step can add the field/environment art and then replace the procedural bodies with final optimized GLB/GLTF models while retaining these same Havok colliders and throw mechanics.
