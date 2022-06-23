'use strict'

const tap = require('tap')
const bootstrap = require('../common/bootstrap.js')
const schemas = require('../../lib/schemas/index.js')
const schema_fixture = require('../fixtures/schema.js')
const {test} = tap

const {
  setup
, teardown
, log
, testWithChain
, ExclusiveLock
} = bootstrap

setup()

test('The instantiation_options Schema is correct', async (t) => {
  t.same(schemas.instantiation_options, schema_fixture, 'schema matches the fixture')
})

testWithChain(tap, 'Instantiation errors', async (t, chain) => {
  /* eslint-disable no-new */

  t.throws(() => {
    new ExclusiveLock()
  }, {
    message: 'A pino logger instance is required'
  , code: 'EINVAL'
  }, 'No params throws a log error first')

  t.throws(() => {
    new ExclusiveLock({
      log: {}
    })
  }, {
    message: 'The logger instance is required to implement levels info, warn, '
      + 'error, debug'
  , code: 'ELOGLEVELS'
  }, 'The required log levels are not supported by the logger instance')

  t.throws(() => {
    new ExclusiveLock({
      log
    })
  }, {
    message: 'Input validation failed'
  , code: 'EINVAL'
  , errors: [
      {
        message: "must have required property 'app_name'"
      }
    ]
  }, 'app_name is required')

  t.throws(() => {
    new ExclusiveLock({
      log
    , app_name: 'my-locking-app'
    })
  }, {
    message: 'Input validation failed'
  , code: 'EINVAL'
  , errors: [
      {
        message: "must have required property 'cache_connection'"
      }
    ]
  }, 'cache_connection is required')

  t.throws(() => {
    new ExclusiveLock({
      log
    , app_name: 'my-locking-app'
    , cache_connection: {}
    })
  }, {
    message: 'A valid cache_connection to a cache store is required'
  , code: 'EINVAL'
  , name: 'TypeError'
  }, 'cache_connection needs to have a .set() method')

  t.throws(() => {
    new ExclusiveLock({
      log
    , app_name: 'my-locking-app'
    , cache_connection: chain.lookup('#cache_connection')
    , lock_ttl_ms: 5000
    })
  }, {
    message: 'Input validation failed'
  , code: 'EINVAL'
  , errors: [
      {
        message: 'must have property lock_refresh_ms when property lock_ttl_ms is present'
      }
    ]
  }, 'lock_ttl_ms and lock_refresh_ms are required together')

  t.throws(() => {
    new ExclusiveLock({
      log
    , app_name: 'my-locking-app'
    , cache_connection: chain.lookup('#cache_connection')
    , lock_refresh_ms: 5000
    })
  }, {
    message: 'Input validation failed'
  , code: 'EINVAL'
  , errors: [
      {
        message: 'must have property lock_ttl_ms when property lock_refresh_ms is present'
      }
    ]
  }, 'lock_ttl_ms and lock_refresh_ms are required together')

  t.throws(() => {
    new ExclusiveLock({
      log
    , app_name: 'my-locking-app'
    , cache_connection: chain.lookup('#cache_connection')
    , lock_ttl_ms: 500
    , lock_refresh_ms: 100
    })
  }, {
    message: 'lock_refresh_ms must be at least 500ms less than lock_ttl_ms'
  , name: 'RangeError'
  , code: 'EINVAL'
  , meta: {
      lock_ttl_ms: 500
    , lock_refresh_ms: 100
    , diff: 400
    }
  }, 'refresh and ttl must be spaced far enough apart')
})

testWithChain(tap, 'Re-acquiring the same lock is a warning', async (t, chain) => {
  const exclusive_lock = new ExclusiveLock({
    log
  , app_name: chain.lookup('!random')
  , cache_connection: chain.lookup('#cache_connection')
  })

  t.teardown(async () => {
    await exclusive_lock.release()
  })

  await t.resolves(exclusive_lock.acquire(), 'Got the lock')

  const result = await exclusive_lock.acquire()
  t.equal(result, true, 'Lock is already required')
})

testWithChain(tap, 'Inspect noops and errors', async (t, chain) => {
  const exclusive_lock = new ExclusiveLock({
    log
  , app_name: chain.lookup('!random')
  , cache_connection: chain.lookup('#cache_connection')
  })

  t.test('Inspecting an unlocked instance is a noop', async (t) => {
    const result = await exclusive_lock.inspect()
    t.same(result, undefined, 'Nothing to inspect because there is no lock')
  })

  t.test('JSON.parse handles errors and returns the raw data if corrupt', async (t) => {
    t.teardown(async () => {
      exclusive_lock.release()
    })
    await t.resolves(exclusive_lock.acquire(), 'Got the lock')
    // Corrupt the file
    const bad_contents = '{"nope": '
    await exclusive_lock.cache_connection.set(exclusive_lock.lock_name, bad_contents)
    const result = await exclusive_lock.inspect()
    t.same(result, bad_contents, 'The raw contents were returned')
  })
})

testWithChain(tap, 'refresh() noops and errors', async (t, chain) => {
  const cache_connection = chain.lookup('#cache_connection')
  const exclusive_lock = new ExclusiveLock({
    log
  , app_name: chain.lookup('!random')
  , cache_connection
  , lock_ttl_ms: 600
  , lock_refresh_ms: 100
  , auto_refresh: false
  })

  t.test('Cannot refresh without a lock', async (t) => {
    exclusive_lock.refresh()
  })

  t.test('Cannot refresh when there is already a refresh running', async (t) => {
    t.teardown(async () => {
      exclusive_lock.is_refreshing = false
      await exclusive_lock.release()
    })
    await t.resolves(exclusive_lock.acquire(), 'Got the lock')
    exclusive_lock.is_refreshing = true
    exclusive_lock.refresh()
    t.equal(exclusive_lock.is_refreshing, true, 'is_refreshing is still true')
  })

  t.test('An error setting pexpire is gracefully handled', async (t) => {
    const pexpire = cache_connection.pexpire
    t.teardown(async (t) => {
      await exclusive_lock.release()
      cache_connection.pexpire = pexpire
    })
    await t.resolves(exclusive_lock.acquire(), 'Got the lock')
    cache_connection.pexpire = async () => {
      throw new Error('BOOM, something failed')
    }
    exclusive_lock.refresh()
    t.same(exclusive_lock.is_refreshing, true, 'is_refreshing is true')
    await chain.sleep({ms: 200}).execute()
    const pttl = await cache_connection.pttl(exclusive_lock.lock_name)
    t.ok(pttl <= 400, 'The TTL was not reset', {pttl})
    t.equal(exclusive_lock.is_refreshing, false, 'is_refreshing was reset even on error')
  })
})

testWithChain(tap, 'Errors are handled in release()', async (t, chain) => {
  const cache_connection = chain.lookup('#cache_connection')
  const exclusive_lock = new ExclusiveLock({
    log
  , app_name: chain.lookup('!random')
  , cache_connection
  , lock_ttl_ms: 600
  , lock_refresh_ms: 100
  , auto_refresh: false
  })

  const del = cache_connection.del
  t.teardown(async () => {
    cache_connection.del = del
    await exclusive_lock.release()
  })

  cache_connection.del = async () => {
    throw new Error('NO DELETE FOR YOU!')
  }

  await t.resolves(exclusive_lock.acquire(), 'Got a lock')
  await t.resolves(exclusive_lock.release(), 'Released worked despite the error')
  t.equal(exclusive_lock.acquired, false, 'acquired was reset')
})

teardown()
