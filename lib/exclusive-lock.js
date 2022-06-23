'use strict'

const Ajv = require('ajv')
const schemas = require('./schemas/index.js')
const jsonParseFilter = require('./json-parse-filter.js')

const DEFAULT_LOCK_TTL_MS = 3000
const DEFAULT_LOCK_REFRESH_MS = 1000
const REQUIRED_MIN_MS_DIFF = 500
const REQUIRED_LOG_LEVELS = [
  'info'
, 'warn'
, 'error'
, 'debug'
]

const ajv = new Ajv()
const validate = ajv.compile(schemas.instantiation_options)

class ExclusiveLock {
  #key

  constructor(opts) {
    opts = opts ?? {}

    if (!opts.log) {
      const err = new Error('A pino logger instance is required')
      err.code = 'EINVAL'
      throw err
    }

    const missing_levels = []
    const accepted_levels = opts.log.levels?.values ?? {}
    for (const level of REQUIRED_LOG_LEVELS) {
      if (!Object.prototype.hasOwnProperty.call(accepted_levels, level)) {
        missing_levels.push(level)
      }
    }
    if (missing_levels.length) {
      const err = new Error(`The logger instance is required to implement levels ${
        missing_levels.join(', ')
      }`)
      err.code = 'ELOGLEVELS'
      throw err
    }

    this.log = opts.log

    if (!validate(opts)) {
      const err = new Error('Input validation failed')
      err.code = 'EINVAL'
      err.errors = validate.errors.map((e) => {
        const {instancePath, message} = e
        return {instancePath, message}
      })
      this.log.error(err)
      throw err
    }

    const {
      app_name
    , cache_connection
    , lock_ttl_ms = DEFAULT_LOCK_TTL_MS
    , lock_refresh_ms = DEFAULT_LOCK_REFRESH_MS
    , lock_contents = 1 // Can be specified for more context, e.g. POD_NAME
    , auto_refresh = true
    } = opts

    if (typeof cache_connection?.set !== 'function') {
      const err = new TypeError('A valid cache_connection to a cache store is required')
      err.code = 'EINVAL'
      throw err
    }
    const diff = lock_ttl_ms - lock_refresh_ms
    if (diff < REQUIRED_MIN_MS_DIFF) {
      const err = new RangeError(
        `lock_refresh_ms must be at least ${REQUIRED_MIN_MS_DIFF}ms less than lock_ttl_ms`
      )
      err.code = 'EINVAL'
      err.meta = {
        lock_ttl_ms
      , lock_refresh_ms
      , diff
      }
      throw err
    }

    this.cache_connection = cache_connection
    this.app_name = app_name.replace(/[\s\W]+/g, '-')
    this.lock_ttl_ms = lock_ttl_ms
    this.lock_refresh_ms = lock_refresh_ms
    this.lock_contents = lock_contents
    this.auto_refresh = auto_refresh
    this.#key = `lock-manager:${this.app_name}`

    this.acquired = false
    this.is_refreshing = false
    this.refresh_timer = null
  }

  get key() {
    return this.#key
  }

  async acquire() {
    if (this.acquired) {
      this.log.warn('%s lock is already acquired. Must remove first.', this.key)
      return true
    }
    // We want this to throw if there are cache errors since that's a deal breaker
    const acquired = await this.cache_connection.set(
      this.key
    , JSON.stringify(this.lock_contents)
    , 'PX' // set expire in millis
    , this.lock_ttl_ms
    , 'NX' // set only if the record does Not eXist yet
    )

    if (acquired) {
      this.acquired = true
      if (this.auto_refresh) {
        this.refresh_timer = setInterval(this.refresh.bind(this), this.lock_refresh_ms)
      }
      this.log.info({
        lock_contents: this.lock_contents
      , lock_refresh_ms: this.lock_refresh_ms
      , lock_ttl_ms: this.lock_ttl_ms
      }, '%s lock acquired', this.app_name)
    }
    return this.acquired
  }

  async inspect() {
    if (!this.acquired) return
    const raw = await this.cache_connection.get(this.key)
    try {
      return JSON.parse(raw, jsonParseFilter)
    } catch (err) {
      this.log.error({err}, 'Lock contents is corrupt: %s', err)
      return raw
    }
  }

  refresh() {
    if (!this.acquired) return
    if (this.is_refreshing) return
    this.is_refreshing = true
    this.cache_connection
      .pexpire(this.key, this.lock_refresh_ms)
      .then(() => {
        this.log.debug('%s lock refreshed to %sms', this.key, this.lock_refresh_ms)
      })
      .catch((err) => {
        this.log.error({err}, 'Could not refresh lock: %s', err)
      })
      .finally(() => {
        this.is_refreshing = false
      })
  }

  async release() {
    if (!this.acquired) return
    clearInterval(this.refresh_timer)
    this.refresh_timer = null
    try {
      await this.cache_connection.del(this.key)
      this.log.info('%s lock removed', this.key)
    } catch (err) {
      this.log.error({err}, 'Error removing lock %s: %s', this.key, err)
    } finally {
      this.acquired = false
    }
  }
}

module.exports = ExclusiveLock
