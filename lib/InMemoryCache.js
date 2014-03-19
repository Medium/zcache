// Copyright 2013 The Obvious Corporation.

var Q = require('kew')
var util = require('util')
var CacheInstance = require('./CacheInstance')

/**
 * A complete in-memory in-process cache. It stores all the key/values in memory
 * and usually keeps them for a short period of time. The purpose is to accommodate
 * the access patterns where the same piece of data is required for multiple times
 * in a short period of time.
 *
 * You can set the TTL of each invidicual key, and you can also set a global TTL
 * for all the keys. A reaper is invoked periodically to remove expired keys.
 *
 * @constructor
 * @extends CacheInstance
 */
function InMemoryCache() {
  CacheInstance.call(this)

  // stores all of the caches values
  this._data = {}

  // the key is the same as the one in _data, the value is time after which the key can be reaped
  this._expireAt = {}

  // run the reaper runs at least once every this many milliseconds
  this._reaperIntervalMs = 2500

  // if this is set to a number > 0, each item will live this many ms instead
  // of maxAgesMs passed in to set/mset
  this._maxAgeOverride = false

  // The reaper interval
  this._reaperInterval = null
  this._isAvailable = false
}
util.inherits(InMemoryCache, CacheInstance)

/**
 * Get the number of keys currently in the cache.
 *
 * Note: this function returns the number of keys that are in the cache
 *       and taking memory, but some of them might have expired already
 *       and the reaper will remove them when it runs.
 *
 * @return {number} The number of keys
 */
InMemoryCache.prototype.getKeyCount = function () {
  return Object.keys(this._data).length
}

/**
 * Set how frequently the reaper runs.
 *
 * @param {number} everyMs The interval of two consecutive runs of the reaper, in milliseconds.
 */
InMemoryCache.prototype.setReaperInterval = function (everyMs) {
  this._reaperIntervalMs = everyMs
  this._resetReaper()
}

/**
 * Set a custom ttl for every object added to the cache from here on out.
 *
 * @param {number} maxAgeMs The TTL of the objects in this cache, in milliseconds.
 */
InMemoryCache.prototype.overrideMaxAgeMs = function (maxAgeMs) {
  this._maxAgeOverride = maxAgeMs
}

/** @override */
InMemoryCache.prototype.isAvailable = function () {
  return this._isAvailable
}

/** @override */
InMemoryCache.prototype.connect = function () {
  this._isAvailable = true
  this._resetReaper()
  this.emit('connect')
  return true
}

/** @override */
InMemoryCache.prototype.disconnect = function () {
  this._destroyReaper()
  this._isAvailable = false
  this.emit('disconnect')
}

/** @override */
InMemoryCache.prototype.destroy = function () {
  this._destroyReaper()
  this._isAvailable = false
  ;delete this._data
  ;delete this._expireAt
  this.emit('destroy')
}

/** @override */
InMemoryCache.prototype.get = function (key) {
  return this.mget([key]).then(function (data) {
    return data[0]
  })
}

/** @override */
InMemoryCache.prototype.mget = function (keys) {
  var ret = []
  this._accessCount += keys.length
  for (var i = 0; i < keys.length; i++) {
    if (this._expireAt[keys[i]] > Date.now()) {
      ret[i] = this._data[keys[i]]
      this._hitCount += 1
    } else {
      ret[i] = undefined
    }
  }
  return Q.resolve(ret)
}

/** @override */
InMemoryCache.prototype.set = function (key, val, maxAgeMs) {
  if ((maxAgeMs === undefined || maxAgeMs <= 0) && !this._maxAgeOverride) throw new Error('maxAge must either be positive or overriden with a positive overrideMaxAgeMs')

  this._expireAt[key] = Date.now() + (this._maxAgeOverride || maxAgeMs )
  return this._data[key] = val
}

/** @override */
InMemoryCache.prototype.mset = function (items, maxAgeMs) {
  for (var i = 0; i < items.length; i++) {
    this.set(items[i].key, items[i].value, maxAgeMs)
  }
}

/** @override */
InMemoryCache.prototype.del = function (key) {
  ;delete this._data[key]
  ;delete this._expireAt[key]
  return true
}

/** @override */
CacheInstance.prototype.getPendingRequestsCount = function () {
  var requestCounts = {}
  requestCounts['count'] = 0
  return [requestCounts]
}

// Create a reaper which scans through all of the items in _data every
// this._reaperIntervalMs millisseconds, if the item has expired then
// it's deleted.
InMemoryCache.prototype._createReaper = function () {
  return setInterval(function () {
    Object.keys(this._expireAt).map(function (key) {
      if (this._expireAt[key] < Date.now()) this.del(key)
    }.bind(this))
  }.bind(this), this._reaperIntervalMs)
}

// Destroy the reaper interval if it exists
InMemoryCache.prototype._destroyReaper = function () {
  if (!!this._reaperInterval) clearInterval(this._reaperInterval)
}

// Destroy the reaper interval and create a new reaper
// this is done when you reset the reaper interval
InMemoryCache.prototype._resetReaper = function () {
  this._destroyReaper()
  this._reaperInterval = this._createReaper()
}

module.exports = InMemoryCache
