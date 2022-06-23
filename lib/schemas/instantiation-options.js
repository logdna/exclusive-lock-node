'use strict'

const fluent = require('fluent-json-schema')

const instantiation_options = fluent
  .object()
  .id('#instantiation_options')
  .dependencies({
    lock_ttl_ms: ['lock_refresh_ms']
  , lock_refresh_ms: ['lock_ttl_ms']
  })
  .prop('name', fluent
    .string()
    .minLength(1)
    .required()
    .description('The app name to be used in the lock\'s name'))
  .prop('cache_connection', fluent
    .object()
    .required()
    .description('A connection to a redis-compatible cache store'))
  .prop('log', fluent
    .object()
    .description('A logger instance such as `pino`. Default is `abstract-logging`.'))
  .prop('lock_ttl_ms', fluent
    .number()
    .description('Optionally specify a TTL in milliseconds for the lock. '
      + 'Default is 3000'))
  .prop('lock_refresh_ms', fluent
    .number()
    .description('Optionally specify a time in milliseconds for refreshing the lock. '
      + 'Default is 1000'))
  .prop('lock_contents', fluent
    .string()
    .description('Optionally specify the contents of the lock file. Default is "1".'))
  .prop('auto_refresh', fluent
    .boolean()
    .description('Automatically set up refreshing on a timed interval. '
      + 'Default is `true`'))

module.exports = instantiation_options.valueOf()
