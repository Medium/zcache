// potential server statuses
exports.SERVER_STATUS = {
  DISCONNECTED: 1,
  CONNECTED: 2,
  TIMED_OUT: 3,
  DESTROYED: 4
}

// min exponential backoff is 100 milliseconds
exports.MIN_BACKOFF = 100

// max exponential backoff is 15 seconds
exports.MAX_BACKOFF = 15000

// backoff multiplier is 2*
exports.BACKOFF_MULTIPLIER = 2