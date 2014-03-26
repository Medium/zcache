// Copyright 2014 The Obvious Corporation.

/**
 * @fileoverview A pair of cache instances. The primary instance
 * in the pair serves both read and write requests; and the secondary
 * instance will be double-written for all write requests. If it is
 * enabled, the secondary instance will also help warm-up the primary
 * instance by serving read requests that are missed in the primary
 * instance.
 *
 * CachePair is primarily used to switch between two different cache
 * cluster configurations.
 */

var util = require('util')
var Q = require('kew')
var CacheInstance = require('./CacheInstance')
var cacheUtils = require('./CacheUtils')

/**
 * @param {CacheInstance} primaryInstance The primary cache instance that
 *     serves both reads and writes
 * @param {CacheInstance} secondaryInstance The secondary cache instance that
 *     serves both reads and writes
 * @constructor
 * @extends {CacheInstance}
 */
function CachePair(primaryInstance, secondaryInstance) {
  CacheInstance.call(this)

  this._isConnected = false
  this._primary = primaryInstance
  this._secondary = secondaryInstance
  this._shouldReadFromSecondary = false
  this._writeBackMaxAgeMs = -1
}
util.inherits(CachePair, CacheInstance)

/**
 * Enable to read from the secondary server if a key is missed in
 * the primary server. It will also write back to the primary server
 * if it hits the secondary server, using the "defaultMaxAgeMs".
 *
 * @param {number} writeBackMaxAgeMs The live time to use when write back to
 *   to the primary server.
 */
CachePair.prototype.enableReadFromSecondary = function (writeBackMaxAgeMs) {
  this._shouldReadFromSecondary = true
  this._writeBackMaxAgeMs = writeBackMaxAgeMs
}

/** @override */
CachePair.prototype.isAvailable = function () {
  return this._primary.isAvailable() && this._isConnected
}

/** @override */
CachePair.prototype.connect = function () {
  this._isConnected = true
  this._primary.connect()
  this._secondary.connect()
  this.emit('connect')
}

/** @override */
CachePair.prototype.disconnect = function () {
  this._isConnected = false
  this._primary.disconnect()
  this._secondary.disconnect()
  this.emit('disconnect')
}

/** @override */
CachePair.prototype.destroy = function () {
  this.disconnect()
  this._primary.destroy()
  this._secondary.destroy()
  this.emit('destroy')
}

/** @override */
CachePair.prototype.mget = function (keys) {
  var self = this

  var resultPromise = this._primary.mget(keys)
  if (!this._shouldReadFromSecondary) return resultPromise

  return resultPromise
    .then(function (values) {
      // collect the keys that are missed from the primary server
      var keysToRead = []
      var indexOfKeysToRead = []
      for (var i = 0; i < values.length; i++) {
        if (values[i] === undefined && self._maybeOnSecondary(keys[i])) {
          indexOfKeysToRead.push(i)
          keysToRead.push(keys[i])
        }
      }
      if (keysToRead.length === 0) return values

      // try to get the missed keys from the secondary server
      return self._secondary.mget(keysToRead)
        .then(function (valuesRead) {
          var itemsToCache = []
          // Go through the original results from the primary server
          // and fill holes (i.e., missed items).
          for (var i = 0; i < keysToRead.length; i++) {
            if (valuesRead[i] !== undefined) {
              values[indexOfKeysToRead[i]] = valuesRead[i]
              itemsToCache.push({
                key: keysToRead[i],
                value: valuesRead[i]
              })
            }
          }
          // Note: we don't wait for this mset promise.
          if (itemsToCache.length > 0) self._primary.mset(itemsToCache, self._writeBackMaxAgeMs, true)
          return values
        })
    })
}

/** @override */
CachePair.prototype.get = function (key) {
  var self = this
  return this._primary.get(key)
    .then(function (value) {
      if (value === undefined && self._shouldReadFromSecondary && self._maybeOnSecondary(key)) {
        return self._secondary.get(key)
          .then(function (value) {
            // Note: we don't wait for this set promise
            if (value !== undefined) self._primary.set(key, value, self._writeBackMaxAgeMs, true)
            return value
          })
      } else {
        return value
      }
    })
}

/** @override */
CachePair.prototype.set = function (key, val, maxAgeMs, setWhenNotExist) {
  var promises = [this._primary.set(key, val, maxAgeMs, setWhenNotExist)]
  if (this._maybeOnSecondary(key)) promises.push(this._secondary.set(key, val, maxAgeMs, setWhenNotExist))
  return Q.all(promises)
}

/** @override */
CachePair.prototype.mset = function (items, maxAgeMs, setWhenNotExist) {
  var promises = []
  promises.push(this._primary.mset(items, maxAgeMs, setWhenNotExist))

  // Collect the items that should be written into the secondary instance
  var itemsToWrite = []
  for (var i = 0; i < items.length; i++) {
    if (this._maybeOnSecondary(items[i].key)) itemsToWrite.push(items[i])
  }

  if (itemsToWrite.length > 0) {
    promises.push(this._secondary.mset(itemsToWrite, maxAgeMs, setWhenNotExist))
  }

  return Q.all(promises)
}

/** @override */
CachePair.prototype.del = function (key) {
  var promises = [this._primary.del(key)]
  if (this._maybeOnSecondary(key)) promises.push(this._secondary.del(key))
  return Q.all(promises)
}

/** @override */
CachePair.prototype.getStats = function (op) {
  return this._primary.getStats(op)
}

/** @override */
CachePair.prototype.getTimeoutCount = function (op) {
  return this._primary.getTimeoutCount(op)
}

/** @override */
CachePair.prototype.resetTimeoutCount = function (op) {
  return this._primary.resetTimeoutCount(op)
}

/** @override */
CachePair.prototype.getUrisByKey = function (key) {
  var uris = this._primary.getUrisByKey(key)
  this._secondary.getUrisByKey(key).forEach(function (uri) {
    if (uris.indexOf(uri) < 0) uris.push(uri)
  })

  return uris
}

/** @override */
CachePair.prototype.getPendingRequestsCount = function () {
  return cacheUtils.mergePendingRequestCounts([this._primary, this._secondary])
}

/**
 * A helper function to tell if a key may be on one of the servers in
 * the secondary instance, and that server is not one of the servers
 * in the primary instances that hold this key.
 *
 * It compares the all the URIs of the key in the secondary instance,
 * and as long as one of them is not in the primary, it will return
 * true.
 *
 * @param {string} key The key to check
 * @return {boolean}
 */
CachePair.prototype._maybeOnSecondary = function (key) {
  var urisPrimary = this._primary.getUrisByKey(key)
  var urisSecondary = this._secondary.getUrisByKey(key)
  for (var i = 0; i < urisSecondary.length; i++) {
    if (urisPrimary.indexOf(urisSecondary[i]) < 0) return true
  }
  return false
}

module.exports = CachePair
