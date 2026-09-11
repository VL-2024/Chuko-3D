/* CHUKO Modern 3D v0.11.0 — visual scenario source of truth.
 * REAL-money payout remains LMS-authoritative.
 * Existing v20.61 numeric IDs are preserved for compatibility:
 * 1 ZERO, 2 ONE, 3 TWO, 4 FIVE, 5 FIVE_KHAN.
 * New scenarios are appended: 6 THREE, 7 FOUR.
 */
(function (global) {
  'use strict';

  const scenarios = Object.freeze({
    1: Object.freeze({ id:1, key:'ZERO', regular:0, khan:false, demoMultiplier:0 }),
    2: Object.freeze({ id:2, key:'ONE', regular:1, khan:false, demoMultiplier:1 }),
    3: Object.freeze({ id:3, key:'TWO', regular:2, khan:false, demoMultiplier:2 }),
    4: Object.freeze({ id:4, key:'FIVE', regular:5, khan:false, demoMultiplier:10 }),
    5: Object.freeze({ id:5, key:'FIVE_KHAN', regular:5, khan:true, demoMultiplier:50 }),
    6: Object.freeze({ id:6, key:'THREE', regular:3, khan:false, demoMultiplier:3 }),
    7: Object.freeze({ id:7, key:'FOUR', regular:4, khan:false, demoMultiplier:4 })
  });

  const ids = Object.freeze(Object.keys(scenarios).map(Number).sort((a,b)=>a-b));
  const byKey = Object.freeze(Object.fromEntries(ids.map(id => [scenarios[id].key, scenarios[id]])));
  const demoOrder = Object.freeze(['ZERO','ONE','TWO','THREE','FOUR','FIVE','FIVE_KHAN']);
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
