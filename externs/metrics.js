// Copyright 2014. A Medium Corporation.

/** @constructor */
function Counter() {
  /** @type {function()} */
  this.inc

  /** @type {function()} */
  this.clear

  /** @type {number} */
  this.count
}

/** @constructor */
function Timer() {
  /** @type {function(number)} */
  this.update

  /** @type {function(): number} */
  this.oneMinuteRate

  /** @type {function(): number} */
  this.fiveMinuteRate

  /** @type {function(): number} */
  this.fifteenMinuteRate

  /** @type {function(): number} */
  this.count

  /** @type {function(): number} */
  this.min

  /** @type {function(): number} */
  this.max

  /** @type {function(): number} */
  this.mean
}

module.exports = {
  Counter: Counter,
  Timer: Timer
}
