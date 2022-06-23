'use strict'

/* eslint-disable max-len */

module.exports = {
  $schema: 'http://json-schema.org/draft-07/schema#'
, type: 'object'
, $id: '#instantiation_options'
, dependencies: {
    lock_ttl_ms: [
      'lock_refresh_ms'
    ]
  , lock_refresh_ms: [
      'lock_ttl_ms'
    ]
  }
, properties: {
    name: {
      type: 'string'
    , minLength: 1
    , description: "The app name to be used in the lock's name"
    }
  , log: {
      type: 'object'
    , description: 'A logger instance such as `pino`. Default is `abstract-logging`.'
    }
  , cache_connection: {
      type: 'object'
    , description: 'A connection to a redis-compatible cache store'
    }
  , lock_ttl_ms: {
      type: 'number'
    , description: 'Optionally specify a TTL in milliseconds for the lock. Default is 3000'
    }
  , lock_refresh_ms: {
      type: 'number'
    , description: 'Optionally specify a time in milliseconds for refreshing the lock. Default is 1000'
    }
  , lock_contents: {
      type: 'string'
    , description: 'Optionally specify the contents of the lock file. Default is "1".'
    }
  , auto_refresh: {
      type: 'boolean'
    , description: 'Automatically set up refreshing on a timed interval. Default is `true`'
    }
  , key_prefix: {
      type: 'string'
    , description: 'Optional key prefix for the lock. Default is "exclusive-lock".'
    }
  }
, required: [
    'name'
  , 'cache_connection'
  ]
}
