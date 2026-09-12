/* CHUKO Modern 3D v0.13.20 — authoritative scenario catalogue.
 * REAL payout is LMS-authoritative.
 * Numeric IDs are kept for LMS/backward compatibility, while round/display order
 * is defined explicitly below and MUST NOT be derived from numeric sorting.
 */
(function (global) {
  'use strict';

  const scenarios = Object.freeze({
    1:  Object.freeze({ id:1,  key:'ZERO',       regular:0, khan:false, demoMultiplier:0 }),
    2:  Object.freeze({ id:2,  key:'ONE',        regular:1, khan:false, demoMultiplier:1 }),
    8:  Object.freeze({ id:8,  key:'ONE_KHAN',   regular:1, khan:true,  demoMultiplier:5 }),
    3:  Object.freeze({ id:3,  key:'TWO',        regular:2, khan:false, demoMultiplier:2 }),
    9:  Object.freeze({ id:9,  key:'TWO_KHAN',   regular:2, khan:true,  demoMultiplier:10 }),
    6:  Object.freeze({ id:6,  key:'THREE',      regular:3, khan:false, demoMultiplier:3 }),
    10: Object.freeze({ id:10, key:'THREE_KHAN', regular:3, khan:true,  demoMultiplier:15 }),
    7:  Object.freeze({ id:7,  key:'FOUR',       regular:4, khan:false, demoMultiplier:4 }),
    11: Object.freeze({ id:11, key:'FOUR_KHAN',  regular:4, khan:true,  demoMultiplier:20 }),
    4:  Object.freeze({ id:4,  key:'FIVE',       regular:5, khan:false, demoMultiplier:10 }),
    5:  Object.freeze({ id:5,  key:'FIVE_KHAN',  regular:5, khan:true,  demoMultiplier:50 })
  });

  const ids = Object.freeze([1,2,8,3,9,6,10,7,11,4,5]);
  const byKey = Object.freeze(Object.fromEntries(Object.values(scenarios).map(item => [item.key, item])));
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
  function demoAt(index) {
    const key = demoOrder[((Number(index)||0) % demoOrder.length + demoOrder.length) % demoOrder.length];
    return byKey[key];
  }

  global.X2_CHUKO_SCENARIOS = scenarios;
  global.X2ChukoScenarioConfig = Object.freeze({
    scenarios, ids, byKey, demoOrder, demoIds, get, has, getOrDefault, demoMultiplier, demoAt,
    scenarioSetVersion: '2026-09-12-full-khan-variants'
  });
})(window);
