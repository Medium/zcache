// Copyright 2014. A Medium Corporation.

/**
 * @constructor
 */
function Pool(options) {
  /** @type {Function} */
  this.release
  /** @type {Function} */
  this.acquire
  /** @type {Function} */
  this.drain
  /** @type {Function} */
  this.destroyAllNow
}

module.exports = {
  /** @return {Pool} */
  Pool: function (options) {
    return new Pool(options)
  }
}
