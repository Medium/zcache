var memc = require('node-memcache-parser-obvfork').client
var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')

function MemcacheConnection(host, port, encoding) {
  CacheInstance.call(this)

  this._host = host
  this._port = port
  this._encoding = encoding
  this._connection = new memc.Connection()
  this._isAvailable = false

  this._bound_onConnect = this._onConnect.bind(this)
  this._connection.on('error', this._bound_onError = this._onError.bind(this))
  this._connection.on('close', this._bound_onDisconnect = this._onDisconnect.bind(this))
}
util.inherits(MemcacheConnection, CacheInstance)

MemcacheConnection.prototype.isAvailable = function () {
  return this._isAvailable
}

MemcacheConnection.prototype.set = function (key, val, maxAgeMs) {
  var defer = Q.defer()
  if (this._encoding) val = new Buffer(val).toString(this._encoding)
  this._connection.set(key, val, 0x01, Math.floor(maxAgeMs ? maxAgeMs / 1000 : 86400), function (message) {
    defer.resolve(true)
  })
  return defer.promise
}

MemcacheConnection.prototype.get = function (key) {
  var self = this
  var defer = Q.defer()
  this._connection.get(key, function (message) {
    if (message.header.status != memc.constants.status.NO_ERROR || !message.header.bodylen) {
      defer.resolve(undefined)
      return
    }

    var bodyBuffer = message.body
    if (self._encoding) bodyBuffer = new Buffer(bodyBuffer.toString(self._encoding), self._encoding)

    defer.resolve(bodyBuffer.toString('utf8'))
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

MemcacheConnection.prototype.disconnect = function () {
  if (this._isAvailable) {
    this._isAvailable = false
    this._connection.quit(function () {})
  }
}

MemcacheConnection.prototype.destroy = function () {
  var self = this
  this.disconnect()
  self._connection.removeListener('error', self._bound_onError)
  self._connection.removeListener('close', self._bound_onDisconnect)
  self.emit('destroy')
}

MemcacheConnection.prototype.connect = function () {
  var self = this
  this._connection.connect(this._port, this._host, this._bound_onConnect)
}

MemcacheConnection.prototype._onConnect = function () {
  this._isAvailable = true
  this.emit('connect')
}

MemcacheConnection.prototype._onError = function (e) {
  this.emit('error', e)
}

MemcacheConnection.prototype._onDisconnect = function () {
  this._isAvailable = false
  this.emit('disconnect')
}

module.exports = MemcacheConnection