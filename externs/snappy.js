// Copyright 2014. A Medium Corporation.

/**
 * @param {string} value
 * @param {function(?, ?)} callback
 * @return {Buffer}
 */
function compress(value, callback) {}

/**
 * @param {Buffer} value
 * @param {function(Buffer): string} parser
 * @param {function(?, ?)} callback
 * @return {string}
 */
function decompress(value, parser, callback) {}

/**
 * @param {Buffer} value
 * @return {string}
 */
function parse(value) {}

var parsers = {
  json: parse,
  string: parse,
  raw: parse
}

module.exports = {
  parsers: parsers,
  compress: compress,
  decompress: decompress
}
