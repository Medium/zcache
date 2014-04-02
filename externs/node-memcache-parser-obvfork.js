// Copyright 2014. A Medium Corporation.

/** @constructor */
function Connection() {
  /** @type {function(string, Function)} */
  this.delete

  /** @type {function()} */
  this.quit

  /** @type {function(string, function(Message))} */
  this.get
}

/** @constructor */
function Message() {
  /** @type {string} */
  this.body

  /** @type {Object} */
  this.header = {
    bodylen: 0,
    status: 0
  }
}

module.exports = {
  client: {
    /** @const */
    Connection: Connection,

    /** @const */
    constants: {
      status: {
        NO_ERROR: 0
      }
    }
  }
}
