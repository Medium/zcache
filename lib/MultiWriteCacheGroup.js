// Copyright 2014 The Obvious Corporation.

/**
 * @fileoverview A group of cache instances. One of the instances
 * in the group serves both read and write requests; and all other
 * instances are write-only instances that only keep up-to-date data.
 */

var util = require('util')
var Q = require('kew')
var CacheInstance = require('./CacheInstance')
var cacheUtils = require('./CacheUtils')

/**
 * @param {CacheInstance} instance The primary cache instance that
 *     serves both reads and writes
 * @constructor
 * @extends {CacheInstance}
 */
function MultiWriteCacheGroup(instance) {
  CacheInstance.call(this)

  this._isConnected = false
  this._instance = instance
  this._writeOnlyInstances = []
  this._shouldReadFromSecondary = false
  this._writeBackMaxAgeMs = -1
}
util.inherits(MultiWriteCacheGroup, CacheInstance)

/**
 * Add a new instace that cache writes also go to.
 *
 * @param {CacheInstance} instance The write-only cache instance
 */
MultiWriteCacheGroup.prototype.addWriteOnlyNode = function (instance) {
  this._writeOnlyInstances.push(instance)
}

/**
 * Enable to read from the secondary server if a key is missed in
 * the primary server. It will also write back to the primary server
 * if it hits the secondary server, using the "defaultMaxAgeMs".
 *
 * @param {number} writeBackMaxAgeMs The live time to use when write back to
 *   to the primary server.
 */
MultiWriteCacheGroup.prototype.enableReadFromSecondary = function (writeBackMaxAgeMs) {
  this._shouldReadFromSecondary = true
  this._writeBackMaxAgeMs = writeBackMaxAgeMs
}

/** @override */
MultiWriteCacheGroup.prototype.isAvailable = function () {
  return this._instance.isAvailable() && this._isConnected
}

/** @override */
MultiWriteCacheGroup.prototype.connect = function () {
  this._isConnected = true
  this._instance.connect()
  for (var i = 0; i < this._writeOnlyInstances.length; i++) {
    this._writeOnlyInstances[i].connect()
  }
  this.emit('connect')
}

/** @override */
MultiWriteCacheGroup.prototype.disconnect = function () {
  this._isConnected = false
  this._instance.disconnect()
  for (var i = 0; i < this._writeOnlyInstances.length; i++) {
    this._writeOnlyInstances[i].disconnect()
  }
  this.emit('disconnect')
}

/** @override */
MultiWriteCacheGroup.prototype.destroy = function () {
  this.disconnect()
  this._instance.destroy()
  for (var i = 0; i < this._writeOnlyInstances.length; i++) {
    this._writeOnlyInstances[i].destroy()
  }
  this.emit('destroy')
}

/** @override */
MultiWriteCacheGroup.prototype.mget = function (keys) {
  var self = this

  var resultPromise = this._instance.mget(keys)
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
      // TODO: will change to have only *one* secondary instance soon.
      return self._writeOnlyInstances[0].mget(keysToRead)
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
          if (itemsToCache.length > 0) self.mset(itemsToCache, self._writeBackMaxAgeMs, true)
          return values
        })
    })
}

/** @override */
MultiWriteCacheGroup.prototype.get = function (key) {
  var self = this
  return this._instance.get(key)
    .then(function (value) {
      if (value === undefined && self._shouldReadFromSecondary && self._maybeOnSecondary(key)) {
        // TODO: will change to have only *one* secondary instance soon.
        return self._writeOnlyInstances[0].get(key)
          .then(function (value) {
            // Note: we don't wait for this set promise
            if (value !== undefined) self._instance.set(key, value, self._writeBackMaxAgeMs, true)
            return value
          })
      } else {
        return value
      }
    })
}

/** @override */
MultiWriteCacheGroup.prototype.set = function (key, val, maxAgeMs, setWhenNotExist) {
  return this._applyWrites('set', arguments)
}

/** @override */
MultiWriteCacheGroup.prototype.mset = function (items, maxAgeMs, setWhenNotExist) {
  var promises = []
  var appliedUrisByKey = {}
  var self = this

  promises.push(this._instance.mset(items, maxAgeMs, setWhenNotExist))
  items.forEach(function (item) {
    appliedUrisByKey[item.key] = self._instance.getUrisByKey(item.key)
  })

  for (var i = 0; i < this._writeOnlyInstances.length; i++) {
    var itemsToWrite = []
    items.forEach(function (item) {
      var key = item.key
      var uris = self._writeOnlyInstances[i].getUrisByKey(key)
      for (var j = 0; j < uris.length; j++) {
        if (appliedUrisByKey[key].indexOf(uris[j]) < 0) {
          // As long as we missed one uri (which is a server), we should mset
          // the entire instance.
          itemsToWrite.push(item)
          appliedUrisByKey[key] = appliedUrisByKey[key].concat(uris)
          break
        }
      }
    })
    if (itemsToWrite.length > 0) {
      promises.push(this._writeOnlyInstances[i].mset(itemsToWrite, maxAgeMs, setWhenNotExist))
    }
  }
  return Q.all(promises)
}

/** @override */
MultiWriteCacheGroup.prototype.del = function (key) {
  return this._applyWrites('del', arguments)
}

/** @override */
MultiWriteCacheGroup.prototype.getStats = function (op) {
  return this._instance.getStats(op)
}

/** @override */
MultiWriteCacheGroup.prototype.getTimeoutCount = function (op) {
  return this._instance.getTimeoutCount(op)
}

/** @override */
MultiWriteCacheGroup.prototype.resetTimeoutCount = function (op) {
  return this._instance.resetTimeoutCount(op)
}

/** @override */
MultiWriteCacheGroup.prototype.getUrisByKey = function (key) {
  var uris = this._instance.getUrisByKey(key)

  this._writeOnlyInstances.forEach(function (instance) {
    instance.getUrisByKey(key).forEach(function (uri) {
      if (uris.indexOf(uri) < 0) uris.push(uri)
    })
  })

  return uris
}

/**
 * A helper function that does write operations, set, mset and del, to all
 * the instances in a group.
 *
 * @param {string} op The name of the operation. Must be  'set' or 'del'.
 * @param {Array.<*>} args The arguments that passed in to the original function.
 * @return {Promise} A promise that indicates if the write is applied to all instances.
 *     The promise will be rejected *as long as* one of the instace fails to apply the
 *     the writes.
 */
MultiWriteCacheGroup.prototype._applyWrites = function (op, args) {
  var promises = []
  // the first argument is always the key for both 'set' and 'del'
  var key = args[0]

  promises.push(this._instance[op].apply(this._instance, args))
  var appliedUris = this._instance.getUrisByKey(key)

  for (var i = 0; i < this._writeOnlyInstances.length; i++) {
    var writeOnlyUris = this._writeOnlyInstances[i].getUrisByKey(key)
    for (var j = 0; j < writeOnlyUris.length; j++) {
      if (appliedUris.indexOf(writeOnlyUris[j]) < 0) {
        // As long as we missed one uri (which is a server), we should run the op
        // to the entire instance.
        promises.push(this._writeOnlyInstances[i][op].apply(this._writeOnlyInstances[i], args))
        appliedUris = appliedUris.concat(writeOnlyUris)
        break
      }
    }
  }
  return Q.all(promises)
}

/** @override */
MultiWriteCacheGroup.prototype.getPendingRequestsCount = function () {
  return cacheUtils.mergePendingRequestCounts(this._writeOnlyInstances.concat(this._instance))
}

/**
 * A helper function to tell if a key may be on one of the servers in
 * the secondary instance. It compares the all the URIs of the key in
 * the secondary instance, and as long as one of them is not in the
 * primary, it will return true to indicate the key may be located on
 * the secondary instance.
 *
 * @param {string} key The key to check
 * @return {boolean}
 */
MultiWriteCacheGroup.prototype._maybeOnSecondary = function (key) {
  var urisPrimary = this._instance.getUrisByKey(key)
  var urisSecondary = this._writeOnlyInstances[0].getUrisByKey(key)
  for (var i = 0; i < urisSecondary.length; i++) {
    if (urisPrimary.indexOf(urisSecondary[i]) < 0) return true
  }
  return false
}

module.exports = MultiWriteCacheGroup
