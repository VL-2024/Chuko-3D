/* CHUKO Modern 3D v0.13.18 — visual scenario source of truth.
 * REAL-money payout remains LMS-authoritative.
 * Numeric IDs 1..7 are preserved for backward compatibility:
 * 1 ZERO, 2 ONE, 3 TWO, 4 FIVE, 5 FIVE_KHAN, 6 THREE, 7 FOUR.
 * New KHAN variants are appended:
 * 8 ONE_KHAN, 9 TWO_KHAN, 10 THREE_KHAN, 11 FOUR_KHAN.
 *
 * NOTE: demoMultiplier is QA/DEMO-only and is NOT a production payout table.
 * REAL win always comes from LMS.
 */
(function (global) {
  'use strict';

  const scenarios = Object.freeze({
    1:  Object.freeze({ id:1,  key:'ZERO',       regular:0, khan:false, demoMultiplier:0 }),
    2:  Object.freeze({ id:2,  key:'ONE',        regular:1, khan:false, demoMultiplier:1 }),
    3:  Object.freeze({ id:3,  key:'TWO',        regular:2, khan:false, demoMultiplier:2 }),
    4:  Object.freeze({ id:4,  key:'FIVE',       regular:5, khan:false, demoMultiplier:10 }),
    5:  Object.freeze({ id:5,  key:'FIVE_KHAN',  regular:5, khan:true,  demoMultiplier:50 }),
    6:  Object.freeze({ id:6,  key:'THREE',      regular:3, khan:false, demoMultiplier:3 }),
    7:  Object.freeze({ id:7,  key:'FOUR',       regular:4, khan:false, demoMultiplier:4 }),
    8:  Object.freeze({ id:8,  key:'ONE_KHAN',   regular:1, khan:true,  demoMultiplier:5 }),
    9:  Object.freeze({ id:9,  key:'TWO_KHAN',   regular:2, khan:true,  demoMultiplier:10 }),
    10: Object.freeze({ id:10, key:'THREE_KHAN', regular:3, khan:true,  demoMultiplier:15 }),
    11: Object.freeze({ id:11, key:'FOUR_KHAN',  regular:4, khan:true,  demoMultiplier:20 })
  });

  const ids = Object.freeze(Object.keys(scenarios).map(Number).sort((a,b)=>a-b));
  const byKey = Object.freeze(Object.fromEntries(ids.map(id => [scenarios[id].key, scenarios[id]])));
  const demoOrder = Object.freeze([
    'ZERO',
    'ONE', 'ONE_KHAN',
    'TWO', 'TWO_KHAN',
    'THREE', 'THREE_KHAN',
    'FOUR', 'FOUR_KHAN',
    'FIVE', 'FIVE_KHAN'
  ]);
  const demoIds = Object.freeze(demoOrder.map(key => byKey[key].id));

  function get(value) {
    if (typeof value === 'string') {
      const key = value.trim().toUpperCase();
      if (byKey[key]) return byKey[key];
    }
    const n = Number(value);
    return Number.isFinite(n) && scenarios[n] ? scenarios[n] : null;
  }
  function has(value) { return !!get(value); }
  function getOrDefault(value) { return get(value) || scenarios[1]; }
  function demoMultiplier(value) { return Number(getOrDefault(value).demoMultiplier || 0); }

  global.X2_CHUKO_SCENARIOS = scenarios;
  global.X2ChukoScenarioConfig = Object.freeze({scenarios, ids, byKey, demoOrder, demoIds, get, has, getOrDefault, demoMultiplier});
})(window);
