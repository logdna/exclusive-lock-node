'use strict'

const IS_ISO_DATE_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/

module.exports = function jsonParseFilter(key, val) {
  if (IS_ISO_DATE_RE.test(val)) {
    return new Date(val)
  }

  return val
}
