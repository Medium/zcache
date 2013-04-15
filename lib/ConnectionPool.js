var poolModule = require('generic-pool')
var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')

function ConnectionPool(opts) {
  CacheInstance.call(this)

  this._pool = null
  this._poolStatusInterval = null
  this._isAvailable = false

  this._bound_updatePoolStatus = this._updatePoolStatus.bind(this)
  this._bound_releaseClient = this._releaseClient.bind(this)

  opts = opts || {}
  this._opts = {
    name: opts.name || 'cacheConnectionPool',
    create: opts.create,
    destroy: opts.destroy,
    min: opts.min || 1,
    max: opts.max || 50,
    idleTimeoutMillis: opts.idleTimeoutMillis || 30000,
    log: opts.log || false
  }
}
util.inherits(ConnectionPool, CacheInstance)

ConnectionPool.prototype.isAvailable = function () {
  return this._isAvailable
}

ConnectionPool.prototype.setAvailability = function (availability) {
  if (this._isAvailable && !availability) {
    this._isAvailable = availability
    this.emit('disconnect')
  } else if (!this._isAvailable && availability) {
    this._isAvailable = availability
    this.emit('connect')
  }
}

ConnectionPool.prototype._updatePoolStatus = function () {
  if (!this._pool) {
    this.setAvailability(false)
    return
  } else {
    var self = this
    this._pool.acquire(function (err, client) {
      if (err) {
        self.setAvailability(false)
      } else {
        self.setAvailability(client.isAvailable())
        self._pool.release(client)
      }
    })
  }
}

ConnectionPool.prototype.connect = function () {
  this._pool = poolModule.Pool(this._opts)
  this._poolStatusInterval = setInterval(this._bound_updatePoolStatus, 2000)
  this._updatePoolStatus()
}

ConnectionPool.prototype.disconnect = function () {
  var self = this
  this._isAvailable = false

  if (this._poolStatusInterval) clearInterval(this._poolStatusInterval)

  if (this._pool) {
    this._pool.drain(function () {
      if (!self._pool) return
      self._pool.destroyAllNow()
      self._pool = null
      self.setAvailability(false)
    })
  }
}

ConnectionPool.prototype.destroy = function () {
  this.disconnect()
  this.emit('destroy')
}

ConnectionPool.prototype._acquireClient = function () {
  var defer = Q.defer()
  this._pool.acquire(defer.makeNodeResolver())
  return defer.promise
}

ConnectionPool.prototype._releaseClient = function (val, context) {
  this._pool.release(context.client)
}

ConnectionPool.prototype._prepareReleaseClient = function (promise) {
  promise.then(this._bound_releaseClient)
    .fail(this._bound_releaseClient)

  return promise
}

ConnectionPool.prototype.mget = function (keys) {
  var promise = this._acquireClient()
    .setContext({keys: keys})
    .then(callMget)

  return this._prepareReleaseClient(promise)
}

/**
 * Call mget on a memcache client
 *
 * @param  {Object} client the memcache client
 * @param  {Object} context the query context
 * @return {Promise.<Array.<string>>} the cached response
 */
function callMget(client, context) {
  context.client = client
  return client.mget(context.keys)
}

ConnectionPool.prototype.get = function (key) {
  var promise = this._acquireClient()
    .setContext({key: key})
    .then(callGet)

  return this._prepareReleaseClient(promise)
}

/**
 * Call get on a memcache client
 *
 * @param  {Object} client the memcache client
 * @param  {Object} context the query context
 * @return {Promise.<string>} the cached response
 */
function callGet(client, context) {
  context.client = client
  return client.get(context.key)
}

ConnectionPool.prototype.set = function (key, val, maxAgeMs) {
  var promise = this._acquireClient()
    .setContext({key: key, val: val, maxAgeMs: maxAgeMs})
    .then(callSet)

  return this._prepareReleaseClient(promise)
}

/**
 * Call set on a memcache client
 *
 * @param  {Object} client the memcache client
 * @param  {Object} context the query context
 * @return {Promise.<string>} the cached response
 */
function callSet(client, context) {
  context.client = client
  return client.set(context.key, context.val, context.maxAgeMs)
}

ConnectionPool.prototype.del = function (key) {
  var promise = this._acquireClient()
    .setContext({key: key})
    .then(callDel)

  return this._prepareReleaseClient(promise)
}

/**
 * Call delete on a memcache client
 *
 * @param  {Object} client the memcache client
 * @param  {Object} context the query context
 * @return {Promise.<string>} the cached response
 */
function callDel(client, context) {
  context.client = client
  return client.del(context.key)
}

module.exports = ConnectionPool