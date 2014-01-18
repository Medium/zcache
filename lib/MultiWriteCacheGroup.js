// Copyright 2014 The Obvious Corporation.

/**
 * @fileoverview A group of cache instances. One of the instances
 * in the group serves both read and write requests; and all other
 * instances are write-only instances that only keep up-to-date data.
 */

var util = require('util')
var Q = require('kew')
var CacheInstance = require('./CacheInstance')

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

/** @inheritDoc */
MultiWriteCacheGroup.prototype.isAvailable = function () {
  return this._instance.isAvailable() && this._isConnected
}

/** @inheritDoc */
MultiWriteCacheGroup.prototype.connect = function () {
  this._isConnected = true
  this._instance.connect()
  for (var i = 0; i < this._writeOnlyInstances; i++) {
    this._writeOnlyInstances[i].connect()
  }
  this.emit('connect')
}

/** @inheritDoc */
MultiWriteCacheGroup.prototype.disconnect = function () {
  this._isConnected = false
  this._instance.disconnect()
  for (var i = 0; i < this._writeOnlyInstances; i++) {
    this._writeOnlyInstances[i].disconnect()
  }
  this.emit('disconnect')
}

/** @inheritDoc */
MultiWriteCacheGroup.prototype.destroy = function () {
  this.disconnect()
  this._instance.destroy()
  for (var i = 0; i < this._writeOnlyInstances; i++) {
    this._writeOnlyInstances[i].destroy()
  }
  this.emit('destroy')
}

/** @inheritDoc */
MultiWriteCacheGroup.prototype.mget = function (keys) {
  return this._instance.mget(keys)
}

/** @inheritDoc */
MultiWriteCacheGroup.prototype.get = function (key) {
  return this._instance.get(key)
}

/** @inheritDoc */
MultiWriteCacheGroup.prototype.set = function (key, val, maxAgeMs) {
  return this._applyWrites('set', arguments)
}

/** @inheritDoc */
MultiWriteCacheGroup.prototype.mset = function (items, maxAgeMs) {
  return this._applyWrites('mset', arguments)
}

/** @inheritDoc */
MultiWriteCacheGroup.prototype.del = function (key) {
  return this._applyWrites('del', arguments)
}

/** @inheritDoc */
MultiWriteCacheGroup.prototype.getStats = function (op) {
  return this._instance.getStats(op)
}

/** @inheritDoc */
MultiWriteCacheGroup.prototype.getTimeoutCount = function (op) {
  return this._instance.getTimeoutCount(op)
}

/**
 * A helper function that does write operations, set, mset and del, to all
 * the instances in a group.
 *
 * @param {string} op The name of the operation. Must be one of 'set', 'mset' and 'del'.
 * @param {Array.<*>} arguments The arguments that passed in to the original function.
 * @return {Promise} A promise that indicates if the write is applied to all instances.
 *     The promise will be rejected *as long as* one of the instace fails to apply the
 *     the writes.
 */
MultiWriteCacheGroup.prototype._applyWrites = function (op, arguments) {
  var promises = []
  promises.push(this._instance[op].apply(this._instance, arguments))
  for (var i = 0; i < this._writeOnlyInstances.length; i++) {
    promises.push(this._writeOnlyInstances[i][op].apply(this._writeOnlyInstances[i], arguments))
  }
  return Q.all(promises)
}

module.exports = MultiWriteCacheGroup