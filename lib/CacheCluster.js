// Copyright 2014 The Obvious Corporation.

/**
 * @fileoverview A cluster of independent cache instances.
 */

var util = require('util')
var Q = require('kew')
var HashRing = require('hashring')
var CacheInstance = require('./CacheInstance')
var PartialResultError = require('./PartialResultError')
var TimeoutError = require('./TimeoutError')
var metrics = require('metrics')
var cacheUtils = require('./CacheUtils')

/**
 * @constructor
 * @extends {CacheInstance}
 */
function CacheCluster() {
  CacheInstance.call(this)

  this._isConnected = false
  this._servers = {}
  this._capacityIntervals = {}
  this._capacityWarmUpMs = {}
  this._currentCapacities = {}
  this._targetCapacities = {}
  this._partialFailureCount = {}
  this._hashRing = null
}
util.inherits(CacheCluster, CacheInstance)

/**
 * Add a new node.
 *
 * @param {string} uri The URI of the node
 * @param {CacheInstance} instance The cache node
 * @param {number} capacity The target capacity of the node
 * @param {number} warmUpMs How many milliseconds to wait between adding more
 *      capacity to this node. If it is specified, when changing the capacity
 *      of this node, we will wait warmUpMs milliseconds after increase/decrease
 *      one unit of capacity. In other words, the entire capaciy change will take
 *      warmUpMs * | current capaciy - target capaciy | (ms).
 */
CacheCluster.prototype.addNode = function (uri, instance, capacity, warmUpMs) {
  this._currentCapacities[uri] = 0
  this._servers[uri] = instance
  this._targetCapacities[uri] = Math.round(capacity)
  this._capacityWarmUpMs[uri] = warmUpMs

  this._rampUpToTargetCapacity(uri)
}

/**
 * Update the capacity of an existng node.
 *
 * @param {string} uri The URI of the node
 * @param {number} capacity The target capacity of the node
 */
CacheCluster.prototype.setNodeCapacity = function (uri, capacity) {
  if (!capacity && !this._servers[uri]) return
  this._targetCapacities[uri] = Math.round(capacity)

  this._rampUpToTargetCapacity(uri)
}

/** @override */
CacheCluster.prototype.isAvailable = function () {
  for (var uri in this._servers) {
    if (this._servers[uri].isAvailable()) return true
  }
  return false
}

/** @override */
CacheCluster.prototype.connect = function () {
  this._isConnected = true
  for (var uri in this._servers) {
    this._servers[uri].connect()
    this._rampUpToTargetCapacity(uri)
  }
  this.emit('connect')
}

/** @override */
CacheCluster.prototype.disconnect = function () {
  this._isConnected = false
  for (var uri in this._servers) {
    this._resetCapacityInterval(uri)
    this._servers[uri].disconnect()
  }
  this.emit('disconnect')
}

/** @override */
CacheCluster.prototype.destroy = function () {
  this.disconnect()
  for (var uri in this._servers) {
    this._servers[uri].destroy()
    delete this._servers[uri]
  }
  this.emit('destroy')
}

/** @override */
CacheCluster.prototype.mget = function (keys) {
  var keysPerInstance = {}
  var values = {}
  var errors = {}
  var self = this

  keys.forEach(function (key) {
    var uri = self._hashRing.get(key)
    if (!(uri in keysPerInstance)) keysPerInstance[uri] = []
    keysPerInstance[uri].push(key)
  })

  var promises = []
  for (var uri in keysPerInstance) {
    var keysOnInstance = keysPerInstance[uri]
    promises.push(this._servers[uri].mget(keysOnInstance)
      .then(setValues.bind(null, values, keysOnInstance))
      .fail(setError.bind(null, errors, keysOnInstance))
      .end()
    )
  }

  var promise = Q.allSettled(promises)
    .then(function() {
      if (Object.keys(errors).length === 0) {
        return keys.map(function (key) {return values[key]})
      } else {
        self._getPartialFailureCounter('mget').inc()
        throw new PartialResultError(values, errors)
      }
    })

  return this._wrapPromiseWithProfiling(promise, 'mget')
}

/** @override */
CacheCluster.prototype.getUrisByKey = function (key) {
  return [this._hashRing.get(key)]
}

/** @override */
CacheCluster.prototype.get = function (key) {
  var cacheInstance = this._servers[this._hashRing.get(key)]
  return this._wrapPromiseWithProfiling(cacheInstance.get(key), 'get')
}

/** @override */
CacheCluster.prototype.set = function (key, val, maxAgeMs) {
  var cacheInstance = this._servers[this._hashRing.get(key)]
  return this._wrapPromiseWithProfiling(cacheInstance.set(key, val, maxAgeMs), 'set')
}

/** @override */
CacheCluster.prototype.mset = function (items, maxAgeMs) {
  var itemsPerInstance = {}
  var errors = {}
  var self = this

  items.forEach(function (item) {
    var uri = self._hashRing.get(item.key)
    if (!(uri in itemsPerInstance)) itemsPerInstance[uri] = []
    itemsPerInstance[uri].push(item)
  })

  var promises = []
  for (var uri in itemsPerInstance) {
    var itemsOnInstance = itemsPerInstance[uri]
    promises.push(this._servers[uri].mset(itemsOnInstance, maxAgeMs)
      .fail(setError.bind(null, errors, itemsOnInstance.map(function (item) {
        return item.key
      })))
      .end()
    )
  }

  var promise = Q.allSettled(promises)
    .then(function() {
      if (Object.keys(errors).length > 0) {
        self._getPartialFailureCounter('mset').inc()
        throw new PartialResultError({}, errors)
      }
    })

  return this._wrapPromiseWithProfiling(promise, 'mset')
}

/** @override */
CacheCluster.prototype.del = function (key) {
  var cacheInstance = this._servers[this._hashRing.get(key)]
  return cacheInstance.del(key)
}

/** @override */
CacheCluster.prototype.getAccessCount = function () {
  return Object.keys(this._servers).reduce(function (total, uri) {
    return total + this._servers[uri].getAccessCount()
  }.bind(this), 0)
}

/** @override */
CacheCluster.prototype.getHitCount = function () {
  return Object.keys(this._servers).reduce(function (total, uri) {
    return total + this._servers[uri].getHitCount()
  }.bind(this), 0)
}

/** @override */
CacheCluster.prototype.resetCount = function () {
  Object.keys(this._servers).forEach(function (uri) {
    this._servers[uri].resetCount()
  }.bind(this))
}

/**
 * Get the sum of timeout count from all servers in the cluster.
 *
 * @param {string} op The name of the operation, e.g., get, set, etc.
 * @return {number}
 */
CacheCluster.prototype.getTimeoutCount = function (op) {
  var total = 0
  for (var uri in this._servers) total += this._servers[uri].getTimeoutCount(op)
  return total
}

/** @override */
CacheCluster.prototype.resetTimeoutCount = function (op) {
  for (var uri in this._servers) this._servers[uri].resetTimeoutCount(op)
}

/**
 * Get the partial failure count of a certain operation.
 *
 * @param {string} op The name of the operation, e.g., mget or mset.
 * @return {number}
 */
CacheCluster.prototype.getPartialFailureCount = function (op) {
  return this._getPartialFailureCounter(op).count
}

/** @override */
CacheCluster.prototype.getPendingRequestsCount = function () {
  var cacheInstances = []
  for (var uri in this._servers) {
    cacheInstances.push(this._servers[uri])
  }
  return cacheUtils.mergePendingRequestCounts(cacheInstances)
}

/**
 * Reset the partial failure count of a certain operation.
 *
 * @param {string} op The name of the operation, e.g., mget or mset.
 * @return {number}
 */
CacheCluster.prototype.resetPartialFailureCount = function (op) {
  return this._getPartialFailureCounter(op).clear()
}

/**
 * Get the Counter object that tracks the number of partial failures of a certain operation.
 *
 * @param {string} op The name of the operation, e.g., mget or mset.
 * @return {metrics.Counter}
 */
CacheCluster.prototype._getPartialFailureCounter = function (op) {
  if (!this._partialFailureCount[op]) this._partialFailureCount[op] = new metrics.Counter()
  return this._partialFailureCount[op]
}

/**
 * Wrap a promise and measure how long it takses to resolve/reject.
 *
 * @param {Promise} origPromise The promise to wrap.
 * @param {string} opName The name of the cache operation, e.g., 'get', 'set', etc.
 * @return {Promise} A promise that behaves the same as the 'origPromise' with its latency
 *    measured.
 */
CacheCluster.prototype._wrapPromiseWithProfiling = function (origPromise, opName) {
  var startTime = Date.now()
  var self = this

  return origPromise
    .then(function (data) {
      self.getStats(opName).update(Date.now() - startTime)
      return data
    })
}

CacheCluster.prototype._resetCapacityInterval = function (uri) {
  if (this._capacityIntervals[uri]) {
    // clear any running timers
    clearInterval(this._capacityIntervals[uri])
    delete this._capacityIntervals[uri]
  }
}

CacheCluster.prototype._updateHashRing = function () {
  // re-calculate the hash ring with
  this._hashRing = new HashRing(this._currentCapacities, 'md5', {replicas: 4})
}

CacheCluster.prototype._rampUpToTargetCapacity = function (uri) {
  var targetCapacity = this._targetCapacities[uri]
  var warmUpMs = this._capacityWarmUpMs[uri]
  this._resetCapacityInterval(uri)

  // if the current capacity is already the target capacity, nothing needs to be done.
  if (targetCapacity === this._currentCapacities[uri]) return

  // if the cluster isn't connected, just exit
  if (!this._isConnected) return

  if (!warmUpMs || warmUpMs < 1) {
    // start using full capacity immediately
    this._currentCapacities[uri] = targetCapacity
    this._updateHashRing()

  } else {
    if (!this._servers[uri]) return
    // warm with 1 capacity unit every n millis
    var self = this
    this._capacityIntervals[uri] = setInterval(function () {
      if (!self._servers[uri] || self._targetCapacities[uri] === self._currentCapacities[uri]) {
        clearInterval(self._capacityIntervals[uri])
      } else {
        self._currentCapacities[uri] += (self._currentCapacities[uri] < self._targetCapacities[uri] ? 1 : -1)
        self._updateHashRing()
      }
    }, warmUpMs)
  }
}

/**
 * Set mget'ed data back to a key-value map.
 *
 * @param {Object.<string, string>} valueMap The key-value map of fetched cache entries.
 * @param {Array.<string>} keys The keys that have been fetched
 * @param {Array.<string>} values The values that have been fetched
 * @return {Promise.<Array.<string>>} The passed in "values", for easy chaining.
 */
function setValues(valueMap, keys, values) {
  for (var i = 0; i < keys.length; i++) {
    valueMap[keys[i]] = values[i]
  }
  return Q.resolve(values)
}

/**
 * Set the given error to all the given keys.
 *
 * @param {Object.<string, string>} map The key-value map of fetched cache entries.
 * @param {Array.<string>} keys The keys that have been fetched
 * @param {Object} err The error object
 * @return {Object} The passed in "err" object, for easy chaining.
 */
function setError(errorMap, keys, err) {
  for (var i = 0; i < keys.length; i++) {
    errorMap[keys[i]] = err
  }
  return err
}

module.exports = CacheCluster
