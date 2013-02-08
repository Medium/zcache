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

ConnectionPool.prototype._releaseClient = function (client) {
  this._pool.release(client)
}

ConnectionPool.prototype.mget = function (keys) {
  var self = this
  return this._acquireClient()
    .then(function (client) {
      return client.mget(keys)
        .fin(self._releaseClient.bind(self, client))
    })
}

ConnectionPool.prototype.get = function (key) {
  var self = this
  return this._acquireClient()
    .then(function (client) {
      return client.get(key)
        .fin(self._releaseClient.bind(self, client))
    })
}

ConnectionPool.prototype.set = function (key, val, maxAgeMs) {
  var self = this
  return this._acquireClient()
    .then(function (client) {
      return client.set(key, val, maxAgeMs)
        .fin(self._releaseClient.bind(self, client))
    })
}

ConnectionPool.prototype.del = function (key) {
  var self = this
  return this._acquireClient()
    .then(function (client) {
      return client.del(key)
        .fin(self._releaseClient.bind(self, client))
    })
}

module.exports = ConnectionPool