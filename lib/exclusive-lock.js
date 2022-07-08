'use strict'

const {EventEmitter} = require('events')
const Ajv = require('ajv')
const schemas = require('./schemas/index.js')

const DEFAULT_LOCK_TTL_MS = 3000
const DEFAULT_LOCK_REFRESH_MS = 1000
const REQUIRED_MIN_MS_DIFF = 500
const DEFAULT_LOCK_CONTENTS = '1'
const DEFAULT_KEY_PREFIX = 'exclusive-lock'
const SLUGIFY_REGEX = /[\s\W]+/g

const ajv = new Ajv()
const validate = ajv.compile(schemas.instantiation_options)

class ExclusiveLock extends EventEmitter {
  #key

  constructor(opts) {
    super()
    opts = opts ?? {}

    let {log} = opts
    if (!log) {
      log = require('abstract-logging')
    }

    this.log = log

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
      name
    , cache_connection
    , lock_ttl_ms = DEFAULT_LOCK_TTL_MS
    , lock_refresh_ms = DEFAULT_LOCK_REFRESH_MS
    , lock_contents = DEFAULT_LOCK_CONTENTS // Can be specified for more context, e.g. POD_NAME
    , key_prefix = DEFAULT_KEY_PREFIX
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
    this.name = name.replace(SLUGIFY_REGEX, '-')
    this.lock_ttl_ms = lock_ttl_ms
    this.lock_refresh_ms = lock_refresh_ms
    this.lock_contents = lock_contents
    this.#key = `${key_prefix.replace(SLUGIFY_REGEX, '-')}:${this.name}`

    this.acquired = false
    this.is_refreshing = false
    this.refresh_timer = null
  }

  get [Symbol.toStringTag]() {
    return 'ExclusiveLock'
  }

  get key() {
    return this.#key
  }

  async acquire() {
    if (this.acquired) {
      this.log.warn('%s lock is already acquired. Must call release() first.', this.key)
      return true
    }
    // We want this to throw if there are cache errors since that's a deal breaker
    const acquired = await this.cache_connection.set(
      this.key
    , this.lock_contents
    , 'PX' // set expire in millis
    , this.lock_ttl_ms
    , 'NX' // set only if the record does Not eXist yet
    )

    if (acquired) {
      this.acquired = true
      this.refresh_timer = setInterval(this.#refresh.bind(this), this.lock_refresh_ms)
      this.log.info({
        lock_contents: this.lock_contents
      , lock_refresh_ms: this.lock_refresh_ms
      , lock_ttl_ms: this.lock_ttl_ms
      }, '%s lock acquired', this.name)

      this.emit('acquired', this.key)
    }
    return this.acquired
  }

  inspect() {
    if (!this.acquired) return
    return this.cache_connection.get(this.key)
  }

  #refresh() {
    if (this.is_refreshing) return
    this.is_refreshing = true
    this.cache_connection
      .pexpire(this.key, this.lock_ttl_ms)
      .then(() => {
        this.log.trace('%s lock refreshed to %sms', this.key, this.lock_ttl_ms)
        this.emit('refreshed', {
          key: this.key
        , lock_ttl_ms: this.lock_ttl_ms
        })
      })
      .catch((err) => {
        this.log.error({err}, 'Could not refresh lock: %s', err)
        this.emit('error', err)
        this.release().catch((err) => {
          this.log.error({err}, 'Error removing lock %s: %s', this.key, err)
          this.emit('error', err)
        })
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
      this.emit('released', this.key)
    } finally {
      this.acquired = false
    }
  }
}

module.exports = ExclusiveLock
