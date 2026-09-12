(function (global) {
  'use strict';

  const cfg = global.X2_GAME_CONFIG || {};
  const scenarioCfg = global.X2ChukoScenarioConfig;
  if (!scenarioCfg) throw new Error('X2ChukoScenarioConfig must be loaded before lms-adapter.js');

  const params = new URLSearchParams(global.location.search);

  // Contract §9 documents ?mock=false as a real, live-toggleable test
  // parameter ("Выключает локальную эмуляцию и включает LMS"), not just a
  // build-time flag - previously only lms-config.js's static `mock: true`
  // was ever consulted, so this URL param silently did nothing.
  const MOCK = params.has('mock') ? params.get('mock') !== 'false' : !!cfg.mock;

  let session = params.get(cfg.sessionQueryParam || 'session') || null;
  let sessionResolve = null;
  let initResolve = null;
  let runtimeInit = null;
  let mockCounter = 0;
  const mockBalances = {KGS:12450, RUB:50000, USD:150, EUR:140};

  const sessionPromise = new Promise(resolve => {
    sessionResolve = resolve;
    if (session) resolve(session);
  });
  const initPromise = new Promise(resolve => { initResolve = resolve; });

  function isAllowedOrigin(origin) {
    const allowed = cfg.allowedParentOrigins || ['*'];
    return allowed.includes('*') || allowed.includes(origin);
  }
  function targetOrigin() { return cfg.parentOrigin && cfg.parentOrigin !== '*' ? cfg.parentOrigin : '*'; }
  function emit(type, payload = {}) {
    if (global.parent && global.parent !== global) {
      global.parent.postMessage({source:'X2_CHUKO', type, ...payload}, targetOrigin());
    }
  }
  function parseNumbers(value) {
    if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
    if (typeof value !== 'string') return null;
    return value.split(',').map(x=>Number(x.trim())).filter(Number.isFinite);
  }
  function querySettings() {
    const denominations = parseNumbers(params.get('denominations'));
    return {
      gameId: params.get('gameId') || cfg.gameId || 'CHUKO',
      denomination: Number(params.get('denomination') || cfg.denomination || 25),
      denominations: denominations || cfg.denominations || [cfg.denomination || 25],
      currency: String(params.get('currency') || cfg.currency || 'KGS').toUpperCase(),
      currencyDisplay: params.get('currencyDisplay') || cfg.currencyDisplay || cfg.currency || 'KGS',
      language: String(params.get('language') || cfg.language || 'RU').toUpperCase(),
      mode: String(params.get('mode') || cfg.mode || 'demo').toLowerCase(),
      demoAllowed: String(params.get('demoAllowed') ?? cfg.demoAllowed).toLowerCase() === 'true',
      demoBalance: Number(params.get('demoBalance') || cfg.demoBalance || 10000),
      // Contract §9: ?balance= seeds the REAL-mode starting balance for
      // GitHub/standalone testing, standing in for X2_LMS_INIT's `balance`.
      balance: Number(params.get('balance') ?? cfg.balance ?? 0)
    };
  }

  global.addEventListener('message', event => {
    if (!isAllowedOrigin(event.origin)) return;
    const data = event.data || {};
    if (data.type === 'X2_LMS_INIT') {
      runtimeInit = {
        gameId:data.gameId || cfg.gameId || 'CHUKO',
        denomination:data.denomination,
        denominations:data.denominations,
        currency:data.currency,
        currencyDisplay:data.currencyDisplay || data.currencyLabel || data.currencySymbol,
        language:data.language,
        mode:data.mode,
        demoAllowed:data.demoAllowed,
        demoBalance:data.demoBalance,
        balance:data.balance
      };
      if (data.session) {
        session = String(data.session);
        if (sessionResolve) sessionResolve(session);
      }
      if (initResolve) initResolve(runtimeInit);
      return;
    }
    if (data.type === 'X2_LMS_SESSION' && data.session) {
      session = String(data.session);
      if (sessionResolve) sessionResolve(session);
    }
  });

  function makeError(code, message, status) {
    const err = new Error(message || code);
    err.code = code; err.status = status;
    return err;
  }

  async function getGameSettings() {
    if (MOCK || cfg.initMode === 'config' || global.parent === global) return querySettings();
    if (runtimeInit) return {...querySettings(), ...runtimeInit};
    emit('X2_GAME_READY', {
      gameId:params.get('gameId') || cfg.gameId || 'CHUKO',
      needsInit:true,
      needsSession:cfg.sessionMode === 'postMessage'
    });
    const timeout = Number(cfg.requestTimeoutMs || 10000);
    const supplied = await Promise.race([
      initPromise,
      new Promise((_,reject)=>setTimeout(()=>reject(makeError('INIT_TIMEOUT','LMS did not send X2_LMS_INIT')),timeout))
    ]);
    return {...querySettings(), ...supplied};
  }

  async function waitForSession() {
    if (MOCK || cfg.sessionMode === 'cookie') return null;
    if (session) return session;
    if (cfg.sessionMode === 'query') throw makeError('SESSION_REQUIRED','Session query parameter is missing');
    const timeout = Number(cfg.requestTimeoutMs || 10000);
    return Promise.race([
      sessionPromise,
      new Promise((_,reject)=>setTimeout(()=>reject(makeError('SESSION_TIMEOUT','LMS session was not provided by parent iframe')),timeout))
    ]);
  }

  async function apiRequest(path, options={}) {
    const sessionValue = await waitForSession();
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), Number(cfg.requestTimeoutMs || 10000));
    const headers = {
      Accept:'application/json',
      ...(options.body ? {'Content-Type':'application/json'} : {}),
      ...(options.headers || {})
    };
    if (sessionValue && cfg.sessionHeader) headers[cfg.sessionHeader] = sessionValue;
    try {
      const response = await fetch((cfg.apiBase || '') + path, {...options, headers, credentials:'include', signal:controller.signal});
      let data={}; try { data=await response.json(); } catch (_) {}
      if (!response.ok) {
        const code = data.code || (response.status===401?'SESSION_EXPIRED':response.status===409?'INSUFFICIENT_FUNDS':'LMS_HTTP_'+response.status);
        throw makeError(code, data.message || 'LMS request failed', response.status);
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw makeError('LMS_TIMEOUT','LMS request timed out');
      throw err;
    } finally { clearTimeout(timeout); }
  }

  function normalizeBalance(data, requestedCurrency) {
    const balance = Number(data.balance ?? data.newBalance);
    if (!Number.isFinite(balance)) throw makeError('BAD_BALANCE_RESPONSE','LMS balance response has no numeric balance');
    return {
      balance,
      currency:String(data.currency || requestedCurrency || cfg.currency || 'KGS').toUpperCase(),
      currencyDisplay:data.currencyDisplay || data.currencyLabel || data.currencySymbol || cfg.currencyDisplay || requestedCurrency
    };
  }

  function normalizeTicket(data, requested) {
    const ticketId = data.ticketId ?? data.ticket_id ?? data.ticketNumber ?? data.ticket_number;
    const scenarioItem = scenarioCfg.get(data.scenario ?? data.scenarioId ?? data.scenario_id ?? data.scenarioKey);
    const win = Number(data.win ?? data.prize ?? data.winAmount ?? 0);
    const balance = Number(data.balance ?? data.newBalance ?? data.balanceAfterGame);
    const denomination = Number(data.denomination ?? requested.denomination);
    const currency = String(data.currency || requested.currency || cfg.currency || 'KGS').toUpperCase();
    if (ticketId == null || ticketId === '') throw makeError('BAD_TICKET_RESPONSE','LMS response has no ticketId');
    if (!scenarioItem) throw makeError('BAD_SCENARIO_RESPONSE','Unknown scenario returned by LMS');
    if (!Number.isFinite(win) || win < 0) throw makeError('BAD_WIN_RESPONSE','LMS response has invalid win');
    if (!Number.isFinite(balance)) throw makeError('BAD_BALANCE_RESPONSE','LMS ticket response has no numeric balance');
    return {
      ticketId:String(ticketId),
      scenario:scenarioItem.id,
      scenarioKey:scenarioItem.key,
      win,
      balance,
      denomination,
      currency,
      currencyDisplay:data.currencyDisplay || data.currencyLabel || data.currencySymbol || requested.currencyDisplay || cfg.currencyDisplay || currency,
      language:requested.language,
      multiplier:data.multiplier != null ? Number(data.multiplier) : null,
      raw:data
    };
  }

  async function getBalance({currency}={}) {
    const cur = String(currency || cfg.currency || 'KGS').toUpperCase();
    if (MOCK) {
      await new Promise(r=>setTimeout(r,140));
      if (!(cur in mockBalances)) mockBalances[cur]=1000;
      return {balance:mockBalances[cur], currency:cur, currencyDisplay:cfg.currencyDisplay || cur};
    }
    const sep = cfg.endpoints.balance.includes('?') ? '&' : '?';
    return normalizeBalance(await apiRequest(cfg.endpoints.balance + sep + 'currency=' + encodeURIComponent(cur), {method:'GET'}), cur);
  }

  async function createTicket({gameId, denomination, currency, language}) {
    const cur = String(currency || cfg.currency || 'KGS').toUpperCase();
    const lang = String(language || cfg.language || 'RU').toUpperCase();
    if (MOCK) {
      await new Promise(r=>setTimeout(r,180));
      const forced = params.get('scenario');
      const forcedItem = forced != null ? scenarioCfg.get(forced) : null;
      const demoItem = forcedItem || scenarioCfg.demoAt(mockCounter++);
      const scenario = demoItem.id;
      const multiplier = scenarioCfg.demoMultiplier(scenario);
      const win = Number(denomination) * multiplier;
      if (!(cur in mockBalances)) mockBalances[cur]=1000;
      if (mockBalances[cur] < Number(denomination)) throw makeError('INSUFFICIENT_FUNDS','Insufficient mock balance',409);
      mockBalances[cur] = mockBalances[cur] - Number(denomination) + win;
      return {
        ticketId:'MOCK-'+Date.now(), scenario, scenarioKey:scenarioCfg.get(scenario).key, win,
        balance:mockBalances[cur], denomination:Number(denomination), currency:cur,
        currencyDisplay:cfg.currencyDisplay || cur, language:lang, multiplier
      };
    }
    // Contract §3: PayTicket is a plain GET with exactly Method/gameId/amount
    // - not a POST with a JSON body, and the stake field is named `amount`,
    // not `denomination`. currency/language are established once at
    // X2_LMS_INIT and are not part of this call.
    const qs = new URLSearchParams({
      Method: 'PayTicket',
      gameId: String(gameId ?? cfg.gameId ?? ''),
      amount: String(Number(denomination))
    });
    const sep = cfg.endpoints.newGame.includes('?') ? '&' : '?';
    const data = await apiRequest(cfg.endpoints.newGame + sep + qs.toString(), { method:'GET' });
    return normalizeTicket(data,{gameId,denomination,currency:cur,currencyDisplay:cfg.currencyDisplay,language:lang});
  }

  async function createDemoTicket({gameId, denomination, currency, currencyDisplay, language, demoBalance}) {
    await new Promise(r=>setTimeout(r,120));
    const forced = params.get('scenario');
    const forcedItem = forced != null ? scenarioCfg.get(forced) : null;
    const item = forcedItem || scenarioCfg.demoAt(mockCounter++);
    const scenario = item.id;
    const multiplier = scenarioCfg.demoMultiplier(scenario);
    const win = Number(denomination) * multiplier;
    const startBalance = Number(demoBalance ?? cfg.demoBalance ?? 10000);
    if (startBalance < Number(denomination)) throw makeError('INSUFFICIENT_FUNDS','Insufficient demo balance',409);
    const nextBalance = startBalance - Number(denomination) + win;
    return {
      ticketId:'DEMO-'+Date.now(), scenario:item.id, scenarioKey:item.key, win, balance:nextBalance,
      denomination:Number(denomination), currency:String(currency || cfg.currency || 'KGS').toUpperCase(),
      currencyDisplay:currencyDisplay || cfg.currencyDisplay || currency || '',
      language:String(language || cfg.language || 'RU').toUpperCase(), multiplier, demo:true
    };
  }

  global.X2LMS = {getGameSettings,getBalance,createTicket,createDemoTicket,emit,getSession:()=>session};
  setTimeout(()=>emit('X2_GAME_READY',{
    gameId:params.get('gameId') || cfg.gameId || 'CHUKO',
    needsInit:!MOCK && cfg.initMode==='postMessage',
    needsSession:!MOCK && cfg.sessionMode==='postMessage'
  }),0);
})(window);
