var memc = require('node-memcache-parser-obvfork').client
var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')

function MemcacheConnection(host, port) {
  CacheInstance.call(this)

  this._host = host
  this._port = port
  this._connection = new memc.Connection()
  this._isAvailable = false

  this._bound_onConnect = this._onConnect.bind(this)
  this._bound_onDestroy = this._onDestroy.bind(this)
  this._connection.on('error', this._bound_onError = this._onError.bind(this))
  this._connection.on('close', this._bound_onClose = this._onClose.bind(this))
}
util.inherits(MemcacheConnection, CacheInstance)

MemcacheConnection.prototype.isAvailable = function () {
  return this._isAvailable
}

MemcacheConnection.prototype.set = function (key, val, maxAgeMs) {
  var defer = Q.defer()
  this._connection.set(key, val, 0x01, Math.floor(maxAgeMs ? maxAgeMs / 1000 : 86400), function (message) {
    defer.resolve(true)
  })
  return defer.promise
}

MemcacheConnection.prototype.get = function (key) {
  var defer = Q.defer()
  this._connection.get(key, function (message) {
    defer.resolve(message.header.status == memc.constants.status.NO_ERROR && message.header.bodylen ? message.body.toString('utf8') : undefined)
  })
  return defer.promise
}

MemcacheConnection.prototype.mget = function (keys) {
  var promises = []
  for (var i = 0; i < keys.length; i++) {
    promises.push(this.get(keys[i]))
  }
  return Q.all(promises)
}

MemcacheConnection.prototype.del = function (key) {
  var defer = Q.defer()
  this._connection.delete(key, function (message) {
    defer.resolve(true)
  })
  return defer.promise
}

MemcacheConnection.prototype.destroy = function () {
  this._connection.quit(this._bound_onDestroy)
  this._connection.removeListener('error', this._bound_onError)
  this._connection.removeListener('close', this._bound_onClose)
}

MemcacheConnection.prototype.connect = function () {
  var self = this
  this._connection.connect(this._port, this._host, this._bound_onConnect)
}

MemcacheConnection.prototype._onDestroy = function () {
  this._isAvailable = false
  this.emit('destroy')
}

MemcacheConnection.prototype._onConnect = function () {
  this._isAvailable = true
  this.emit('connect')
}

MemcacheConnection.prototype._onError = function (e) {
  this.emit('error', e)
}

MemcacheConnection.prototype._onClose = function () {
  this._isAvailable = false
  this.emit('close')
}

module.exports = MemcacheConnection