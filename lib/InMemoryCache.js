var Q = require('kew')
var util = require('util')
var CacheInstance = require('./CacheInstance')

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
  this._ttlMaxAgeOverride = false

  // The reaper interval
  this._reaperInterval = this._createReaper()
  this._isAvailable = true
}
util.inherits(InMemoryCache, CacheInstance)

// create a reaper which scans through all of the items in _data every
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

// set the reaper to run every everyMs ms
InMemoryCache.prototype.setReaperInterval = function (everyMs) {
  this._reaperIntervalMs = everyMs
  this._resetReaper()
}

// set a custom ttl for every object added to the cache from here on out
InMemoryCache.prototype.overrideTTL = function (maxAgeMs) {
  this._ttlMaxAgeOverride = maxAgeMs
}

InMemoryCache.prototype.isAvailable = function () {
  return this._isAvailable
}

InMemoryCache.prototype.connect = function () {
  this._isAvailable = true
  this._resetReaper()
  this.emit('connect')
  return true
}

InMemoryCache.prototype.disconnect = function () {
  this._destroyReaper()
  this._isAvailable = false
  this.emit('disconnect')
  return true
}

InMemoryCache.prototype.get = function (key) {
  return (this._expireAt[key] > Date.now() ? this._data[key] : undefined)
}

InMemoryCache.prototype.mget = function (keys) {
  var ret = []
  for (var i = 0; i < keys.length; i++) {
    ret.push(this.get(keys[i]))
  }
  return Q.resolve(ret)
}

InMemoryCache.prototype.set = function (key, val, maxAgeMs) {
  this._expireAt[key] = Date.now() + (this._ttlMaxAgeOverride || maxAgeMs )
  return this._data[key] = val
}

InMemoryCache.prototype.mset = function (items, maxAgeMs) {
  for (var i = 0; i < items.length; i++) {
    this.set(items[i].key, items[i].value, maxAgeMs)
  }
}

InMemoryCache.prototype.del = function (key) {
  ;delete this._data[key]
  ;delete this._expireAt[key]
  return true
}

module.exports = InMemoryCache