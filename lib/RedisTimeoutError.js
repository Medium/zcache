// Copyright 2013 The Obvious Corporation.

var util = require('util')

/**
 * @constructor
 */
function RedisTimeoutError(msg) {
  this.message = msg || 'RedisTimeoutError'
}
util.inherits(RedisTimeoutError, Error)
RedisTimeoutError.prototype.name = 'RedisTimeoutError'

module.exports = RedisTimeoutError
