var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')
var cacheUtils = require('./CacheUtils')
var PartialResultError = require('./PartialResultError')

/**
 * @constructor
 * @extends {CacheInstance}
 */
function RedundantCacheGroup() {
  CacheInstance.call(this)

  this._cacheInstances = []
  this._connected = false
}
util.inherits(RedundantCacheGroup, CacheInstance)

function sortInstances(a, b) {
  return b.priority - a.priority
}

RedundantCacheGroup.prototype.add = function (cacheInstance, priority) {
  this._cacheInstances.push({
    instance: cacheInstance,
    priority: priority
  })

  this._cacheInstances.sort(sortInstances)
}

RedundantCacheGroup.prototype._getAvailableInstance = function (start) {
  var instanceIndex = this._getIndexOfFirstAvailableInstance(start)
  if (instanceIndex !== undefined) return this._cacheInstances[instanceIndex].instance

  return null
}

RedundantCacheGroup.prototype._getIndexOfFirstAvailableInstance = function (start) {

  for (var i = (start || 0); i < this._cacheInstances.length; i++) {
    var instance = this._cacheInstances[i].instance
    if (instance.isAvailable()) return i
  }
  return null
}

RedundantCacheGroup.prototype._getAllInstances = function () {
  var instances = []
  for (var i = 0; i < this._cacheInstances.length; i++) {
    var instance = this._cacheInstances[i].instance
    if (instance.isAvailable()) instances.push(instance)
  }
  return instances
}

RedundantCacheGroup.prototype.isAvailable = function () {
  return !!this._getAvailableInstance(0)
}

RedundantCacheGroup.prototype.connect = function () {
  for (var i = 0; i < this._cacheInstances.length; i++) {
    var instance = this._cacheInstances[i].instance
    if (!instance.isAvailable()) instance.connect()
  }
  this.emit('connect')
}

RedundantCacheGroup.prototype.disconnect = function () {
  for (var i = 0; i < this._cacheInstances.length; i++) {
    this._cacheInstances[i].instance.disconnect()
  }
  this.emit('disconnect')
}

RedundantCacheGroup.prototype.destroy = function () {
  for (var i = 0; i < this._cacheInstances.length; i++) {
    this._cacheInstances[i].instance.destroy()
  }
  this._cacheInstances = []
  this.emit('destroy')
}

/**
 * Fetch multiple keys from the highest level cache to the lowest. For missed keys,
 * fetch them from the next level cache; if it runs into errors, stop and throw
 * a PartialResultError that includes the hit keys so far.
 *
 * @param {Array.<string>} keys
 * @param {number=} start
 * @override
 */
RedundantCacheGroup.prototype.mget = function (keys, start) {
  var instanceIndex = this._getIndexOfFirstAvailableInstance(start || 0)
  var self = this

  if (instanceIndex == null) return Q.resolve([])

  return this._getAvailableInstance(instanceIndex).mget(keys)
    .then(function (res) {
      var nextInstanceIndex = self._getIndexOfFirstAvailableInstance(instanceIndex + 1)
      var missedKeys = []
      var missedKeyIndex = []

      for (var i = 0; i < keys.length; i++) {
        if (typeof res[i] === 'undefined') {
          missedKeys.push(keys[i])
          missedKeyIndex.push(i)
        }
      }

      if (missedKeys.length === 0 || !nextInstanceIndex) {
        return res
      }

      return self.mget(missedKeys, nextInstanceIndex)
        .then(function (resFromNextLevel) {
          for (var i = 0; i < missedKeys.length; i++) {
            res[missedKeyIndex[i]] = resFromNextLevel[i]
          }
          return res
        })
        .fail(function (errFromNextLevel) {
          // If there are no partial results from the current level, no need to
          // merge results.
          if (keys.length === missedKeys.length) {
            throw errFromNextLevel
          }

          if (errFromNextLevel instanceof PartialResultError) {
            var data = errFromNextLevel.getData()
            for (var i = 0; i < keys.length; i++) {
              if (typeof res[i] !== 'undefined') data[keys[i]] = res[i]
            }
            throw new PartialResultError(data, errFromNextLevel.getError())
          } else {
            var data = {}
            var err = {}
            for (var i = 0; i < keys.length; i++) {
              if (typeof res[i] !== 'undefined') {
                data[keys[i]] = res[i]
              } else {
                err[keys[i]] = errFromNextLevel
              }
            }
            throw new PartialResultError(data, err)
          }
        })
    })
}

/**
 * @param {number=} start
 * @override
 */
RedundantCacheGroup.prototype.get = function (key, start) {
  var instanceIndex = this._getIndexOfFirstAvailableInstance(start || 0)
  var self = this

  if (instanceIndex == null) return Q.resolve(undefined)

  return this._getAvailableInstance(instanceIndex).get(key)
    .then(function (data) {
      if (data === undefined) return self.get(key, instanceIndex + 1)
      return data
    })
}

RedundantCacheGroup.prototype.mset = function (items, maxAgeMs, setWhenNotExist) {
  var instances = this._getAllInstances()
  var promises = []

  for (var i = 0; i < instances.length; i++) {
    promises.push(instances[i].mset(items, maxAgeMs, setWhenNotExist))
  }

  return Q.all(promises)
    .then(returnTrue)
}

/** @override */
RedundantCacheGroup.prototype.set = function (key, val, maxAgeMs, setWhenNotExist) {
  var instances = this._getAllInstances()
  var promises = []

  for (var i = 0; i < instances.length; i++) {
    promises.push(instances[i].set(key, val, maxAgeMs, setWhenNotExist))
  }

  return Q.all(promises)
    .then(returnTrue)
}

RedundantCacheGroup.prototype.del = function (key) {
  var instances = this._getAllInstances()
  var promises = []

  for (var i = 0; i < instances.length; i++) {
    promises.push(instances[i].del(key))
  }

  return Q.all(promises)
    .then(returnTrue)
}

/** @override */
RedundantCacheGroup.prototype.getUrisByKey = function (key) {
  var uris = []

  this._getAllInstances().forEach(function (instance) {
    instance.getUrisByKey(key).forEach(function (uri) {
      if (uris.indexOf(uri) < 0) uris.push(uri)
    })
  })

  return uris
}

/** @override */
RedundantCacheGroup.prototype.getPendingRequestsCount = function () {
  return cacheUtils.mergePendingRequestCounts(this._getAllInstances())
}

/**
 * Always return true
 * @return {boolean} true!
 */
function returnTrue() {
  return true
}

module.exports = RedundantCacheGroup
