'use strict'

const Ajv = require('ajv')
const schemas = require('./schemas/index.js')
const jsonParseFilter = require('./json-parse-filter.js')

const DEFAULT_LOCK_TTL_MS = 3000
const DEFAULT_LOCK_REFRESH_MS = 1000
const REQUIRED_MIN_MS_DIFF = 500

const ajv = new Ajv()
const validate = ajv.compile(schemas.instantiation_options)

class ExclusiveLock {
  #lock_name

  constructor(opts) {
    opts = opts || {}

    if (!opts.log?.error) {
      const err = new Error('A pino logger instance is required')
      err.code = 'EINVAL'
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
    , log
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
    this.log = log
    this.lock_ttl_ms = lock_ttl_ms
    this.lock_refresh_ms = lock_refresh_ms
    this.lock_contents = lock_contents
    this.auto_refresh = auto_refresh
    this.#lock_name = `lock-manager:${this.app_name}`

    this.got_lock = false
    this.is_refreshing = false
    this.refresh_timer = null
  }

  get lock_name() {
    return this.#lock_name
  }

  async acquire() {
    if (this.got_lock) {
      this.log.warn('%s lock is already acquired. Must remove first.', this.lock_name)
      return true
    }
    // We want this to throw if there are cache errors since that's a deal breaker
    const got_lock = await this.cache_connection.set(
      this.lock_name
    , JSON.stringify(this.lock_contents)
    , 'PX' // set expire in millis
    , this.lock_ttl_ms
    , 'NX' // set only if the record does Not eXist yet
    )

    if (got_lock) {
      this.got_lock = true
      if (this.auto_refresh) {
        this.refresh_timer = setInterval(this.refresh.bind(this), this.lock_refresh_ms)
      }
      this.log.info({
        lock_contents: this.lock_contents
      , lock_refresh_ms: this.lock_refresh_ms
      , lock_ttl_ms: this.lock_ttl_ms
      }, '%s lock acquired', this.app_name)
    }
    return this.got_lock
  }

  async inspect() {
    if (!this.got_lock) return
    const raw = await this.cache_connection.get(this.lock_name)
    try {
      return JSON.parse(raw, jsonParseFilter)
    } catch (err) {
      this.log.error({err}, 'Lock contents is corrupt: %s', err)
      return raw
    }
  }

  refresh() {
    if (!this.got_lock) return
    if (this.is_refreshing) return
    this.is_refreshing = true
    this.cache_connection
      .pexpire(this.lock_name, this.lock_refresh_ms)
      .then(() => {
        this.log.debug('%s lock refreshed to %sms', this.lock_name, this.lock_refresh_ms)
      })
      .catch((err) => {
        this.log.error({err}, 'Could not refresh lock: %s', err)
      })
      .finally(() => {
        this.is_refreshing = false
      })
  }

  async release() {
    if (!this.got_lock) return
    clearInterval(this.refresh_timer)
    this.refresh_timer = null
    try {
      await this.cache_connection.del(this.lock_name)
      this.log.info('%s lock removed', this.lock_name)
    } catch (err) {
      this.log.error({err}, 'Error removing lock %s: %s', this.lock_name, err)
    } finally {
      this.got_lock = false
    }
  }
}

module.exports = ExclusiveLock
