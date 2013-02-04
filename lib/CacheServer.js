var events = require('events')
var Memcached = require('memcached')
var util = require('util')

var common = require('./common')

function CacheServer(clientCtor, uri) {
  this._uri = uri
  this._status  = common.SERVER_STATUS.DISCONNECTED

  clientCtor = clientCtor || Memcached
  this._client = new clientCtor(this._uri, {
    timeout: 20,
    retries: 5,
    retry: 10,
    remove: true,
    poolSize: 50
  })

  this._currentCapacity = 0
  this._targetCapacity = 0

  this._capacityTimer = null

  this.checkStatus()
  this._statusInterval = setInterval(this.checkStatus.bind(this), 5000)
  process.nextTick(this.checkStatus.bind(this))
}
util.inherits(CacheServer, events.EventEmitter)

CacheServer.prototype.checkStatus = function () {
  if (this._status === common.SERVER_STATUS.DESTROYED) return

  var self = this
  this._client.version(function (err, data) {
    self._status = err ? common.SERVER_STATUS.DISCONNECTED : common.SERVER_STATUS.CONNECTED
  })
}

/**
 * Shut down this server client
 */
CacheServer.prototype.close = function () {
  if (this._statusInterval) clearInterval(this._statusInterval)

  this._status = common.SERVER_STATUS.DESTROYED

  this._client.end()
}

/**
 * Get the client for this server
 *
 * @return {Object} the memcache client for this server
 */
CacheServer.prototype.getClient = function () {
  return this._client
}

/**
 * Get the status for this server
 *
 * @return {number} the status for this server from ServerStatus
 */
CacheServer.prototype.getStatus = function () {
  return this._status
}

/**
 * Get the current capacity for this server
 */
CacheServer.prototype.getCurrentCapacity = function () {
  return this._currentCapacity
}

/**
 * Get the target capacity for this server
 */
CacheServer.prototype.getTargetCapacity = function () {
  return this._targetCapacity
}

/**
 * Set the capacity for this server
 *
 * @param {number} capacity the target capacity to set
 * @param {number} msPerCapacityUnit the number of ms to wait between increments
 *     or decrements of the capacity
 */
CacheServer.prototype.setCapacity = function (capacity, msPerCapacityUnit) {
  if (this._capacityTimer) clearInterval(this._capacityTimer)
  this._targetCapacity = capacity

  if (!msPerCapacityUnit) {
    this._currentCapacity = capacity
    this.emit('capacity', this._currentCapacity)
  } else {
    this._capacityTimer = setInterval(this._updateCapacity.bind(this), msPerCapacityUnit)
  }
}

/**
 * Incrementing or decrementing the capacity for this server
 */
CacheServer.prototype._updateCapacity = function () {
  if (this._status !== common.SERVER_STATUS.CONNECTED) return

  if (this._targetCapacity > this._currentCapacity) {
    this._currentCapacity++
  } else if (this._targetCapacity < this._currentCapacity) {
    this._currentCapacity--
  }

  this.emit('capacity', this._currentCapacity)
  if (this._targetCapacity === this._currentCapacity) clearInterval(this._capacityTimer)
}

module.exports = CacheServer