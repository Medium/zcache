var util = require('util')

var CacheInstance = require('./CacheInstance')

function ConnectionWrapper(cacheInstance, opts) {
  CacheInstance.call(this)

  this._state = {
    shouldConnect: true,
    nextDelayMs: 1,
    nextConnectTimeout: null
  }

  this._cacheInstance = cacheInstance

  opts = opts || {}
  this._opts = {
    maxDelay: opts.maxDelay || 10000
  }

  this._bound_attemptConnect = this._attemptConnect.bind(this)
  this._cacheInstance.on('connect', this._bound_onConnect = this._onConnect.bind(this))
  this._cacheInstance.on('disconnect', this._bound_onDisconnect = this._onDisconnect.bind(this))
  this._cacheInstance.on('error', this._bound_onError = this._onError.bind(this))
}
util.inherits(ConnectionWrapper, CacheInstance)

ConnectionWrapper.prototype.isAvailable = function () {
  return this._cacheInstance.isAvailable()
}

ConnectionWrapper.prototype.connect = function () {
  this._state.shouldConnect = true
  this._connectDelayed(0)
}

ConnectionWrapper.prototype.disconnect = function () {
  this._state.shouldConnect = false
  if (this._state.nextConnectTimeout) clearTimeout(this._state.nextConnectTimeout)
  if (this._cacheInstance.isAvailable()) this._cacheInstance.disconnect()
}

ConnectionWrapper.prototype.destroy = function () {
  this.disconnect()
  this._cacheInstance.destroy()
  this.emit('destroy')
}

ConnectionWrapper.prototype.mget = function (keys) {
  return this._cacheInstance.mget(keys)
}

ConnectionWrapper.prototype.get = function (key, val) {
  return this._cacheInstance.get(key, val)
}

ConnectionWrapper.prototype.set = function (key, val, maxAgeMs) {
  return this._cacheInstance.set(key, val, maxAgeMs)
}

ConnectionWrapper.prototype.del = function (key) {
  return this._cacheInstance.del(key)
}

ConnectionWrapper.prototype._attemptConnect = function () {
  if (!this._state.shouldConnect) return
  this._cacheInstance.connect()
}

ConnectionWrapper.prototype._connectDelayed = function () {
  if (!this._state.shouldConnect) return
  if (this._state.nextConnectTimeout) clearTimeout(this._state.nextConnectTimeout)
  var connectTimeout = setTimeout(this._bound_attemptConnect, this._state.nextDelayMs)
  this._state.nextDelayMs *= 2
  if (this._state.nextDelayMs > this._opts.maxDelay) this._state.nextDelayMs = this._opts.maxDelay
}

ConnectionWrapper.prototype._onConnect = function () {
  this._state.nextDelayMs = 1
  this.emit('connect')
}

ConnectionWrapper.prototype._onDisconnect = function () {
  this.emit('disconnect')
  this._connectDelayed()
}

ConnectionWrapper.prototype._onError = function (e) {
  console.error(e)
  this.emit('error', e)
  this._connectDelayed()
}

module.exports = ConnectionWrapper