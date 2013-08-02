// Copyright 2013 The Obvious Corporation.

/**
 * Information about a cache server.
 *
 * @constructor
 */
function ServerInfo() {
  this.memoryBytes = 0
  this.memoryRssBytes = 0
  this.evictedKeys = 0
  this.numOfConnections = 0
  this.numOfKeys = 0
}

module.exports = ServerInfo
