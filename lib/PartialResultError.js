// Copyright 2014 The Obvious Corporation.

var util = require('util')

/**
 * An error that presents partial results from cache operations
 * that are distributed over multiple cache servers.
 *
 * @param {Object.<string, *>} data The keys that have been processed
 *     successfully. The values in this object is the returned result
 *     from the cache server.
 * @param {Object.<string, *>} err The keys that failed to process.
 *     The values in this object are the errors.
 * @constructor
 */
function PartialResultError(data, err) {
  Error.captureStackTrace(this, PartialResultError)
  this._data = data
  this._err = err
}
util.inherits(PartialResultError, Error)
PartialResultError.prototype.name = 'PartialResultError'

/**
 * @return {Object.<string, *>} data The keys that have been processed
 *     successfully. The values in this object is the returned result
 *     from the cache server.
 */
PartialResultError.prototype.getData = function () {
  return this._data
}

/**
 * @param {Object.<string, *>} err The keys that failed to process.
 *     The values in this object are the errors.
 */
PartialResultError.prototype.getError = function () {
  return this._err
}

module.exports = PartialResultError
