// Copyright 2014. A Medium Corporation.

var events = require('events')

/**
 * @constructor
 * @extends {events.EventEmitter}
 */
function RedisClient() {
  /** @type {Array} */
  this.command_queue = []
}

module.exports = {
  /**
   * @param {?number} port
   * @param {?string} host
   * @return {RedisClient}
   */
  createClient: function (port, host) {
    return new RedisClient()
  }
}
