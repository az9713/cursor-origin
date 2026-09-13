'use strict';
/* ── Codebase Atlas — Seed Generator ───────────────────────────
   Generates ≥ 350 in-memory JS files with parseable function
   definitions and realistic cross-file call references.
   30 domains × 12 file types = 360 + 13 core files = 373 total.
──────────────────────────────────────────────────────────────── */
window.Seed = (function () {

  const DOMAINS = [
    'auth','user','product','order','payment','shipping',
    'inventory','search','notification','analytics','billing','cart',
    'checkout','catalog','review','rating','wishlist','recommendation',
    'discount','coupon','voucher','loyalty','subscription','account',
    'profile','address','contact','session','token','cache'
  ];

  const TYPES = [
    'service','model','validator','handler','utils',
    'api','store','hooks','middleware','types','constants','test'
  ];

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function up(s)  { return s.toUpperCase(); }

  /* ── File-type code generators ─────────────────────────────── */
  const GEN = {

    service: (d, C) => `\
// src/${d}/service.js — ${C} service layer

function init${C}Service() {
  const cfg = get${C}Constants();
  const cached = getCached('${d}:config');
  if (cached) return cached;
  const svc = { name: '${d}', version: cfg.version, ready: true };
  setCached('${d}:config', svc);
  return svc;
}

function get${C}(id) {
  validate${C}Id(id);
  const cached = getCached('${d}:' + id);
  if (cached) return cached;
  const raw = fetch${C}FromStore(id);
  const obj = deserialize${C}(raw);
  setCached('${d}:' + id, obj);
  return obj;
}

function create${C}(data) {
  const valid = validate${C}(data);
  const model = create${C}Model(valid);
  const saved = persist${C}(model);
  trackEvent('${d}.created', { id: saved.id });
  return saved;
}

function update${C}(id, patch) {
  validate${C}Id(id);
  const existing = get${C}(id);
  const merged = merge${C}(existing, validate${C}(patch));
  const saved = persist${C}(merged);
  trackEvent('${d}.updated', { id });
  return saved;
}

function delete${C}(id) {
  validate${C}Id(id);
  checkAuthPermission('delete', '${d}');
  remove${C}FromStore(id);
  trackEvent('${d}.deleted', { id });
}

function list${C}s(query) {
  const params = parse${C}Query(query);
  return search${C}Store(params);
}`,

    model: (d, C) => `\
// src/${d}/model.js — ${C} model

function create${C}Model(data) {
  return Object.assign({ id: null, createdAt: Date.now(), updatedAt: null }, data);
}

function build${C}Model(raw) {
  const model = create${C}Model(raw);
  return normalize${C}(model);
}

function normalize${C}(obj) {
  if (!obj) return null;
  return Object.keys(obj).reduce(function (acc, k) {
    acc[k] = obj[k] !== undefined ? obj[k] : null;
    return acc;
  }, {});
}

function serialize${C}(obj) {
  return JSON.stringify(obj);
}

function deserialize${C}(raw) {
  if (typeof raw === 'string') return create${C}Model(JSON.parse(raw));
  return create${C}Model(raw || {});
}`,

    validator: (d, C) => `\
// src/${d}/validator.js — ${C} validation

function validate${C}(data) {
  if (!data) throw new Error('${C} data is required');
  validate${C}Fields(data);
  return sanitize${C}(data);
}

function validate${C}Id(id) {
  if (id === null || id === undefined) throw new Error('${C} id is required');
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new Error('${C} id must be string or number');
  }
  return true;
}

function validate${C}Fields(data) {
  var required = get${C}Constants().requiredFields || [];
  for (var i = 0; i < required.length; i++) {
    if (data[required[i]] === undefined) throw new Error('Missing: ' + required[i]);
  }
  return true;
}

function sanitize${C}(data) {
  var allowed = get${C}Constants().allowedFields;
  if (!allowed) return Object.assign({}, data);
  return allowed.reduce(function (acc, k) {
    if (data[k] !== undefined) acc[k] = data[k];
    return acc;
  }, {});
}`,

    handler: (d, C) => `\
// src/${d}/handler.js — ${C} request handlers

function handle${C}Get(req, res) {
  checkAuthPermission('read', '${d}');
  var id = req.params && req.params.id;
  var obj = get${C}(id);
  res.json({ data: obj });
}

function handle${C}Create(req, res) {
  checkAuthPermission('create', '${d}');
  var obj = create${C}(req.body || {});
  res.json({ data: obj, status: 'created' });
}

function handle${C}Update(req, res) {
  checkAuthPermission('update', '${d}');
  var id = req.params && req.params.id;
  var obj = update${C}(id, req.body || {});
  res.json({ data: obj });
}

function handle${C}Delete(req, res) {
  checkAuthPermission('delete', '${d}');
  var id = req.params && req.params.id;
  delete${C}(id);
  res.json({ status: 'deleted' });
}

function handle${C}List(req, res) {
  checkAuthPermission('list', '${d}');
  var items = list${C}s(req.query);
  res.json({ data: items, count: items.length });
}`,

    utils: (d, C) => `\
// src/${d}/utils.js — ${C} utilities

function format${C}(obj) {
  if (!obj) return '';
  return JSON.stringify(obj, null, 2);
}

function parse${C}Query(query) {
  if (!query) return {};
  if (typeof query === 'string') {
    try { return JSON.parse(query); } catch (e) { return {}; }
  }
  return query;
}

function transform${C}Data(data, schema) {
  return Object.keys(schema).reduce(function (acc, k) {
    acc[k] = data[k] !== undefined ? data[k] : schema[k];
    return acc;
  }, {});
}

function compute${C}Hash(obj) {
  var str = JSON.stringify(obj);
  var h = 0;
  for (var i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function merge${C}(a, b) {
  return Object.assign({}, a, b);
}`,

    api: (d, C) => `\
// src/${d}/api.js — ${C} API endpoint registration

function register${C}Endpoints(router) {
  applyAuthMiddleware(router);
  apply${C}Middleware(router);
  router.get('/${d}/:id', handle${C}Get);
  router.post('/${d}', handle${C}Create);
  router.put('/${d}/:id', handle${C}Update);
  router.delete('/${d}/:id', handle${C}Delete);
  router.get('/${d}', handle${C}List);
  return router;
}

function handle${C}Request(req, res, next) {
  req.${d}Data = parse${C}Body(req);
  next();
}

function parse${C}Body(req) {
  var raw = (req && req.body) || {};
  return sanitize${C}(raw);
}

function format${C}Response(data, meta) {
  return { data: data, meta: meta || {}, ts: Date.now() };
}`,

    store: (d, C) => `\
// src/${d}/store.js — ${C} in-memory store

var _${d}Store = new Map();

function init${C}Store() {
  _${d}Store = new Map();
  return true;
}

function fetch${C}FromStore(id) {
  return _${d}Store.get(String(id)) || null;
}

function persist${C}(model) {
  var key = String(model.id || ('${d}_' + Date.now()));
  if (!model.id) model.id = key;
  _${d}Store.set(key, model);
  return model;
}

function remove${C}FromStore(id) {
  return _${d}Store.delete(String(id));
}

function search${C}Store(params) {
  var results = [];
  _${d}Store.forEach(function (v) {
    if (match${C}Entry(v, params)) results.push(v);
  });
  return results;
}

function match${C}Entry(obj, params) {
  return Object.keys(params).every(function (k) { return obj[k] === params[k]; });
}`,

    hooks: (d, C) => `\
// src/${d}/hooks.js — ${C} reactive hooks

function use${C}(id) {
  var data = get${C}(id);
  return { data: data, loading: false, error: null };
}

function use${C}List(query) {
  var items = list${C}s(query);
  return { items: items, count: items.length, loading: false };
}

function use${C}Create() {
  return function (data) {
    var result = create${C}(data);
    trackEvent('${d}.hook.create', { id: result.id });
    return result;
  };
}

function use${C}Update() {
  return function (id, patch) {
    var result = update${C}(id, patch);
    trackEvent('${d}.hook.update', { id: id });
    return result;
  };
}`,

    middleware: (d, C) => `\
// src/${d}/middleware.js — ${C} middleware

function apply${C}Middleware(router) {
  router.use(transform${C}Request);
  router.use(check${C}Permission);
  return router;
}

function check${C}Permission(req, res, next) {
  var session = getSession(req);
  var ok = checkAuthPermission((req.method || 'GET').toLowerCase(), '${d}');
  if (!ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  next();
}

function rate${C}Limit(req, res, next) {
  var key = '${d}:rate:' + (req.ip || 'local');
  var count = (getCached(key) || 0) + 1;
  setCached(key, count);
  if (count > 100) { res.status(429).json({ error: 'Too Many Requests' }); return; }
  next();
}

function transform${C}Request(req, res, next) {
  if (req.body) req.body = sanitize${C}(req.body);
  next();
}`,

    types: (d, C) => `\
// src/${d}/types.js — ${C} type definitions

function define${C}Type(shape) {
  return Object.freeze(Object.assign({ __type: '${d}' }, shape));
}

function extend${C}Type(base, extra) {
  return define${C}Type(Object.assign({}, base, extra));
}

function is${C}(obj) {
  if (!obj || obj.__type !== '${d}') return false;
  try { validate${C}(obj); return true; } catch (e) { return false; }
}

function assert${C}(obj) {
  if (!is${C}(obj)) throw new TypeError('Expected ${C}, got: ' + typeof obj);
  return obj;
}`,

    constants: (d, C) => `\
// src/${d}/constants.js — ${C} constants

var ${up(d)}_VERSION = '1.0.0';
var ${up(d)}_MAX_ITEMS = 1000;
var ${up(d)}_CACHE_TTL = 3600;
var ${up(d)}_REQUIRED_FIELDS = ['id', 'createdAt'];
var ${up(d)}_ALLOWED_FIELDS = ['id', 'name', 'status', 'createdAt', 'updatedAt', 'meta'];

function get${C}Constants() {
  return {
    version: ${up(d)}_VERSION,
    maxItems: ${up(d)}_MAX_ITEMS,
    cacheTtl: ${up(d)}_CACHE_TTL,
    requiredFields: ${up(d)}_REQUIRED_FIELDS,
    allowedFields: ${up(d)}_ALLOWED_FIELDS
  };
}

function get${C}DefaultConfig() {
  var c = get${C}Constants();
  return { enabled: true, maxRetries: 3, timeout: 5000, domain: '${d}', version: c.version };
}`,

    test: (d, C) => `\
// src/${d}/test.js — ${C} tests

function test${C}Service() {
  init${C}Service();
  var created = create${C}({ name: 'test-${d}', status: 'active' });
  var fetched = get${C}(created.id);
  var updated = update${C}(created.id, { status: 'inactive' });
  delete${C}(updated.id);
  return { passed: true, suite: '${d}.service' };
}

function test${C}Model() {
  var model = create${C}Model({ name: 'model-test' });
  var built = build${C}Model(model);
  var serial = serialize${C}(built);
  var deser = deserialize${C}(serial);
  return { passed: Boolean(deser && deser.name), suite: '${d}.model' };
}

function test${C}Validator() {
  var threw = false;
  try { validate${C}(null); } catch (e) { threw = true; }
  var valid = validate${C}({ id: '1', name: 'ok', status: 'active' });
  return { passed: threw && Boolean(valid), suite: '${d}.validator' };
}

function test${C}Integration() {
  var svc = init${C}Service();
  var obj = create${C}({ id: 'int-1', name: 'int-test', status: 'draft' });
  trackEvent('${d}.test.run', { id: obj.id });
  return { passed: Boolean(svc && obj), suite: '${d}.integration' };
}`

  };

  /* ── Core cross-domain files ─────────────────────────────────
     These define the symbols that appear in every domain's
     service / handler / middleware templates.
  ──────────────────────────────────────────────────────────── */
  function coreFiles() {
    return [
      {
        path: 'src/core/cache.js',
        language: 'js',
        text: `\
// src/core/cache.js — In-memory key-value cache

var __atlasCache = new Map();

function getCached(key) {
  return __atlasCache.get(String(key)) || null;
}

function setCached(key, value) {
  __atlasCache.set(String(key), value);
  return value;
}

function deleteCached(key) {
  return __atlasCache.delete(String(key));
}

function clearCache() {
  __atlasCache.clear();
}

function hasCached(key) {
  return __atlasCache.has(String(key));
}

function cacheSize() {
  return __atlasCache.size;
}`
      },
      {
        path: 'src/core/analytics.js',
        language: 'js',
        text: `\
// src/core/analytics.js — Event tracking

var __eventLog = [];

function trackEvent(name, data) {
  var evt = { name: name, data: data || {}, ts: Date.now() };
  __eventLog.push(evt);
  return evt;
}

function trackPageView(path) {
  return trackEvent('page.view', { path: path });
}

function getEventLog() {
  return __eventLog.slice();
}

function clearEventLog() {
  __eventLog = [];
}

function flushEvents(endpoint) {
  var batch = getEventLog();
  clearEventLog();
  return batch;
}`
      },
      {
        path: 'src/core/permission.js',
        language: 'js',
        text: `\
// src/core/permission.js — Auth permission checks

var __permissions = new Map();

function checkAuthPermission(action, resource) {
  var key = action + ':' + resource;
  if (__permissions.has(key)) return __permissions.get(key);
  return true; // open by default in dev
}

function grantPermission(role, action, resource) {
  __permissions.set(action + ':' + resource, true);
  trackEvent('permission.grant', { role: role, action: action, resource: resource });
}

function revokePermission(role, action, resource) {
  __permissions.set(action + ':' + resource, false);
  trackEvent('permission.revoke', { role: role, action: action, resource: resource });
}

function listPermissions() {
  var out = [];
  __permissions.forEach(function (v, k) { out.push({ key: k, allowed: v }); });
  return out;
}

function resetPermissions() {
  __permissions.clear();
}`
      },
      {
        path: 'src/core/session.js',
        language: 'js',
        text: `\
// src/core/session.js — Session management

var __sessions = new Map();

function getSession(req) {
  var id = req && (req.sessionId || (req.headers && req.headers['x-session']));
  if (!id) return {};
  return __sessions.get(id) || {};
}

function createSession(data) {
  var id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  __sessions.set(id, Object.assign({ id: id, createdAt: Date.now() }, data));
  return id;
}

function destroySession(sessionId) {
  return __sessions.delete(sessionId);
}

function refreshSession(sessionId) {
  var sess = __sessions.get(sessionId);
  if (!sess) return null;
  sess.refreshedAt = Date.now();
  __sessions.set(sessionId, sess);
  return sess;
}

function listSessions() {
  var out = [];
  __sessions.forEach(function (v) { out.push(v); });
  return out;
}`
      },
      {
        path: 'src/core/logger.js',
        language: 'js',
        text: `\
// src/core/logger.js — Structured logger

var __logLevel = 'info';
var __logBuffer = [];

function logInfo(msg, meta) {
  return writeLog('info', msg, meta);
}

function logWarn(msg, meta) {
  return writeLog('warn', msg, meta);
}

function logError(msg, err) {
  return writeLog('error', msg, { message: err && err.message, stack: err && err.stack });
}

function writeLog(level, msg, meta) {
  var entry = { level: level, msg: msg, meta: meta || {}, ts: Date.now() };
  __logBuffer.push(entry);
  return entry;
}

function getLogBuffer() {
  return __logBuffer.slice();
}

function clearLogBuffer() {
  __logBuffer = [];
}`
      },
      {
        path: 'src/core/errors.js',
        language: 'js',
        text: `\
// src/core/errors.js — Custom error types

function createAppError(code, message, meta) {
  var err = new Error(message);
  err.code = code;
  err.meta = meta || {};
  err.isAppError = true;
  return err;
}

function isAppError(err) {
  return Boolean(err && err.isAppError);
}

function createValidationError(field, message) {
  return createAppError('VALIDATION_ERROR', message, { field: field });
}

function createNotFoundError(resource, id) {
  return createAppError('NOT_FOUND', resource + ' not found: ' + id, { resource: resource, id: id });
}

function createForbiddenError(action, resource) {
  return createAppError('FORBIDDEN', 'Cannot ' + action + ' ' + resource, { action: action, resource: resource });
}`
      },
      {
        path: 'src/core/events.js',
        language: 'js',
        text: `\
// src/core/events.js — Domain event bus

var __handlers = {};

function on(eventName, handler) {
  if (!__handlers[eventName]) __handlers[eventName] = [];
  __handlers[eventName].push(handler);
  return handler;
}

function off(eventName, handler) {
  if (!__handlers[eventName]) return;
  __handlers[eventName] = __handlers[eventName].filter(function (h) { return h !== handler; });
}

function emit(eventName, payload) {
  var handlers = __handlers[eventName] || [];
  handlers.forEach(function (h) { h(payload); });
  trackEvent('bus.' + eventName, payload);
}

function once(eventName, handler) {
  var wrapped = function (payload) {
    handler(payload);
    off(eventName, wrapped);
  };
  return on(eventName, wrapped);
}

function listListeners(eventName) {
  return (__handlers[eventName] || []).length;
}`
      },
      {
        path: 'src/core/middleware.js',
        language: 'js',
        text: `\
// src/core/middleware.js — Shared middleware utilities

function applyAuthMiddleware(router) {
  router.use(authGuard);
  router.use(sessionLoader);
  return router;
}

function authGuard(req, res, next) {
  var token = req.headers && req.headers['authorization'];
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

function sessionLoader(req, res, next) {
  req.session = getSession(req);
  next();
}

function requestLogger(req, res, next) {
  logInfo('request', { method: req.method, path: req.path });
  next();
}

function errorHandler(err, req, res, next) {
  logError('unhandled', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
}`
      },
      {
        path: 'src/core/router.js',
        language: 'js',
        text: `\
// src/core/router.js — Minimal router

function createRouter() {
  var routes = [];
  var router = {
    use: function (fn) { routes.push({ type: 'middleware', fn: fn }); return router; },
    get: function (path, fn) { routes.push({ type: 'GET', path: path, fn: fn }); return router; },
    post: function (path, fn) { routes.push({ type: 'POST', path: path, fn: fn }); return router; },
    put: function (path, fn) { routes.push({ type: 'PUT', path: path, fn: fn }); return router; },
    delete: function (path, fn) { routes.push({ type: 'DELETE', path: path, fn: fn }); return router; }
  };
  return router;
}

function mountRouter(app, prefix, router) {
  logInfo('mount', { prefix: prefix });
  return app;
}

function listRoutes(router) {
  return (router._routes || []).map(function (r) { return r.type + ' ' + r.path; });
}`
      },
      {
        path: 'src/core/config.js',
        language: 'js',
        text: `\
// src/core/config.js — Global configuration

var __config = {
  env: 'development',
  version: '1.0.0',
  debug: true,
  maxCacheSize: 10000,
  sessionTtl: 86400
};

function getConfig(key) {
  return key ? __config[key] : Object.assign({}, __config);
}

function setConfig(key, value) {
  __config[key] = value;
  logInfo('config.set', { key: key });
}

function loadConfigFromEnv() {
  var env = (typeof process !== 'undefined' && process.env) || {};
  Object.keys(env).forEach(function (k) {
    if (k.startsWith('APP_')) setConfig(k.slice(4).toLowerCase(), env[k]);
  });
  return getConfig();
}

function validateConfig() {
  var required = ['env', 'version'];
  return required.every(function (k) { return Boolean(__config[k]); });
}`
      },
      {
        path: 'src/index.js',
        language: 'js',
        text: `\
// src/index.js — Application bootstrap

function bootstrap() {
  loadConfigFromEnv();
  logInfo('bootstrap.start', { version: getConfig('version') });
  initUserService();
  initAuthService();
  initProductService();
  initOrderService();
  initPaymentService();
  initSessionService();
  logInfo('bootstrap.done', {});
  return { ready: true };
}

function shutdown() {
  logWarn('shutdown', {});
  clearCache();
  clearEventLog();
  clearLogBuffer();
}

function getVersion() {
  return getConfig('version');
}

function healthCheck() {
  return {
    status: 'ok',
    version: getVersion(),
    cacheSize: cacheSize(),
    ts: Date.now()
  };
}

function runAllTests() {
  var results = [];
  results.push(testUserService());
  results.push(testAuthService());
  results.push(testProductService());
  results.push(testOrderService());
  var passed = results.filter(function (r) { return r.passed; }).length;
  return { total: results.length, passed: passed, results: results };
}`
      },
      {
        path: 'src/core/utils.js',
        language: 'js',
        text: `\
// src/core/utils.js — Shared utility functions

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  return JSON.parse(JSON.stringify(obj));
}

function pick(obj, keys) {
  return keys.reduce(function (acc, k) {
    if (obj[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});
}

function omit(obj, keys) {
  return Object.keys(obj).reduce(function (acc, k) {
    if (keys.indexOf(k) === -1) acc[k] = obj[k];
    return acc;
  }, {});
}

function debounce(fn, ms) {
  var t;
  return function () {
    clearTimeout(t);
    t = setTimeout(fn.bind(this, arguments), ms);
  };
}

function throttle(fn, ms) {
  var last = 0;
  return function () {
    var now = Date.now();
    if (now - last >= ms) { last = now; return fn.apply(this, arguments); }
  };
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}`
      },
      {
        path: 'src/core/http.js',
        language: 'js',
        text: `\
// src/core/http.js — HTTP client wrapper

function httpGet(url, opts) {
  logInfo('http.get', { url: url });
  return fetch(url, Object.assign({ method: 'GET' }, opts)).then(parseHttpResponse);
}

function httpPost(url, body, opts) {
  logInfo('http.post', { url: url });
  return fetch(url, Object.assign({ method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' } }, opts)).then(parseHttpResponse);
}

function httpPut(url, body, opts) {
  return fetch(url, Object.assign({ method: 'PUT', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' } }, opts)).then(parseHttpResponse);
}

function httpDelete(url, opts) {
  return fetch(url, Object.assign({ method: 'DELETE' }, opts)).then(parseHttpResponse);
}

function parseHttpResponse(res) {
  if (!res.ok) throw createAppError('HTTP_ERROR', 'HTTP ' + res.status, { status: res.status });
  return res.json();
}`
      }
    ];
  }

  /* ── Public: generate() ─────────────────────────────────────── */
  function generate() {
    var files = [];

    DOMAINS.forEach(function (d) {
      var C = cap(d);
      TYPES.forEach(function (type) {
        files.push({
          path: 'src/' + d + '/' + type + '.js',
          language: 'js',
          text: GEN[type](d, C)
        });
      });
    });

    // Add core + root files (13 more → 373 total)
    coreFiles().forEach(function (f) { files.push(f); });

    return files; // 360 + 13 = 373
  }

  return { generate: generate };
})();
