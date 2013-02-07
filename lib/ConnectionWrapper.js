var util = require('util')

var CacheInstance = require('./CacheInstance')

function ConnectionWrapper(cacheInstance, opts) {
  CacheInstance.call(this)

  this._cacheInstance = cacheInstance
  this._opts = opts || {}
}
util.inherits(ConnectionWrapper, CacheInstance)

ConnectionWrapper.prototype.isAvailable = function () {
  return this._cacheInstance.isAvailable()
}

ConnectionWrapper.prototype.connect = function () {
  this._shouldConnect = true
}

ConnectionWrapper.prototype.disconnect = function () {
  this._shouldConnect = false
  if (this._cacheInstance.isAvailable()) this._cacheInstance.disconnect()
}

module.exports = ConnectionWrapper