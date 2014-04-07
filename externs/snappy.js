// Copyright 2014. A Medium Corporation.

/**
 * @param {string} value
 * @return {Buffer}
 */
function compressSync(value) {}

/**
 * @param {Buffer} value
 * @param {function(Buffer): string} parser
 * @return {string}
 */
function decompressSync(value, parser) {}

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
  compressSync: compressSync,
  decompressSync: decompressSync
}

