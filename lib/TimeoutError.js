// Copyright 2013 The Obvious Corporation.

var util = require('util')

/**
 * @constructor
 * @extends {Error}
 */
function TimeoutError(msg) {
  Error.captureStackTrace(this, TimeoutError)
  this.message = msg || 'TimeoutError'
}
util.inherits(TimeoutError, Error)
TimeoutError.prototype.name = 'TimeoutError'

module.exports = TimeoutError
