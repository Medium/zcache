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
 * @extends {Error}
 */
function PartialResultError(data, err) {
  Error.captureStackTrace(this, PartialResultError)
  this._flattenData(data, err)
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
 * @return {Object.<string, *>} The keys that failed to process.
 *     The values in this object are the errors.
 */
PartialResultError.prototype.getError = function () {
  return this._err
}

/**
 * Transforms an object that may contain one level of PartialResultErrors to a flat mapping of keys to errors.
 * 
 * @param {Object.<string, *>} data
 * @param {Object.<string, *>} errors
 */
PartialResultError.prototype._flattenData = function (data, errors) {
  var flattenedErrors = {}
  for (var errorKey in errors) {
    if (errors[errorKey] instanceof PartialResultError) {
      var partialResultErrorObject = errors[errorKey].getError()
      for (var partialResultErrorKey in partialResultErrorObject) {
        flattenedErrors[partialResultErrorKey] = partialResultErrorObject[partialResultErrorKey]
      }
      var partialResultDataObject = errors[errorKey].getData()
      for (var dataKey in partialResultDataObject) {
        data[dataKey] = partialResultDataObject[dataKey]["value"]
      }
    } else {
      flattenedErrors[errorKey] = errors[errorKey]
    }
  }
  this._data = data
  this._err = flattenedErrors
}

module.exports = PartialResultError
