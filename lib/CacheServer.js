var events = require('events')
var memcache = require('memcache')
var util = require('util')

var common = require('./common')

function CacheServer(uri) {
  this._uri = uri
  var uriParts = this._uri.split(':')

  this._host = uriParts[0]
  this._port = uriParts[1]
  this._client = new memcache.Client(this._port, this._host)

  this._currentCapacity = 0
  this._targetCapacity = 0
  this._status  = common.SERVER_STATUS.DISCONNECTED

  this._connectionTimer = null
  this._connectionIntervalMs = 0

  this._capacityTimer = null

  this._client.on('connect', this._bound_onConnect = this._onConnect.bind(this))
  this._client.on('close', this._bound_onClose = this._onClose.bind(this))
  this._client.on('timeout', this._bound_onTimeout = this._onTimeout.bind(this))
  this._client.on('error', this._bound_onError = this._onError.bind(this))

  this._scheduleConnect()
}
util.inherits(CacheServer, events.EventEmitter)

/**
 * Shut down this server client
 */
CacheServer.prototype.close = function () {
  this._client.removeListener('connect', this._bound_onConnect)
  this._client.removeListener('close', this._bound_onClose)
  this._client.removeListener('timeout', this._bound_onTimeout)
  this._client.removeListener('error', this._bound_onError)

  this._status = common.SERVER_STATUS.DESTROYED
  this._client.close()
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
  if (this._targetCapacity > this._currentCapacity) {
    this._currentCapacity++
  } else if (this._targetCapacity < this._currentCapacity) {
    this._currentCapacity--
  }

  this.emit('capacity', this._currentCapacity)
  if (this._targetCapacity === this._currentCapacity) clearInterval(this._capacityTimer)
}

/**
 * Schedule the next connection attempt for a memcache client
 *
 * @param {string} host colon-delimited host with port
 */
CacheServer.prototype._scheduleConnect = function () {
  if (this._connectionTimer || this._status == common.SERVER_STATUS.DESTROYED) return

  var attemptMs
  var self = this

  if (!this._connectionIntervalMs) {
    attemptMs = 1
    this._connectionIntervalMs = common.MIN_BACKOFF
  } else {
    attemptMs = this._connectionIntervalMs
    if (this._connectionIntervalMs < common.MAX_BACKOFF) {
      this._connectionIntervalMs *= common.BACKOFF_MULTIPLIER
      if (this._connectionIntervalMs > common.MAX_BACKOFF) this._connectionIntervalMs = common.MAX_BACKOFF
    }
  }

  console.log("Attempting connection to '" + this._uri + "' in " + attemptMs + "ms")
  self._connectionTimer = setTimeout(function () {
    delete self._connectionTimer
    self._client.connect()
  }, attemptMs)
}

/**
 * Handle a timed out client
 */
CacheServer.prototype._onTimeout = function () {
  this._status = common.SERVER_STATUS.TIMED_OUT
  console.warn("Memcache server '" + this._uri + "' timed out")
  this._client.close()
  this._scheduleConnect()
}

/**
 * Handle an erroring client
 */
CacheServer.prototype._onError = function (e) {
  console.error("Memcache server '" + this._uri + "' error")
  this._scheduleConnect()
}

/**
 * Handle a closed client
 */
CacheServer.prototype._onClose = function () {
  this._status = common.SERVER_STATUS.DISCONNECTED
  this._scheduleConnect()
}

/**
 * Handle a connected client
 */
CacheServer.prototype._onConnect = function () {
  this._connectionIntervalMs = 0
  this._status = common.SERVER_STATUS.CONNECTED
  console.info("Memcache server '" + this._host + "' connected")
}

module.exports = CacheServer