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
    message: 'Input validation failed'
  , code: 'EINVAL'
  , errors: [
      {
        message: "must have required property 'name'"
      }
    ]
  }, 'name is required')

  t.throws(() => {
    new ExclusiveLock({
      name: 'my-locking-app'
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
      name: 'my-locking-app'
    , cache_connection: {}
    })
  }, {
    message: 'A valid cache_connection to a cache store is required'
  , code: 'EINVAL'
  , name: 'TypeError'
  }, 'cache_connection needs to have a .set() method')

  t.throws(() => {
    new ExclusiveLock({
      name: 'my-locking-app'
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
      name: 'my-locking-app'
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
      name: 'my-locking-app'
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

  t.throws(() => {
    new ExclusiveLock({
      name: 'my-locking-app'
    , cache_connection: chain.lookup('#cache_connection')
    , lock_contents: null
    })
  }, {
    message: 'Input validation failed'
  , code: 'EINVAL'
  , errors: [
      {
        instancePath: '/lock_contents'
      , message: 'must be string'
      }
    ]
  }, 'throws if lock_contents is null')
})

testWithChain(tap, 'Providing a log instance works', async (t, chain) => {
  const exclusive_lock = new ExclusiveLock({
    name: 'my-locking-app'
  , cache_connection: chain.lookup('#cache_connection')
  , log
  })
  await t.resolves(exclusive_lock.acquire(), 'Lock acquired')
  await t.resolves(exclusive_lock.release(), 'Lock released, which makes a log statement')
})

testWithChain(tap, 'Re-acquiring the same lock is a warning', async (t, chain) => {
  const exclusive_lock = new ExclusiveLock({
    log
  , name: chain.lookup('!random')
  , cache_connection: chain.lookup('#cache_connection')
  })

  t.teardown(async () => {
    await exclusive_lock.release()
  })

  await t.resolves(exclusive_lock.acquire(), 'Got the lock')

  const result = await exclusive_lock.acquire()
  t.equal(result, true, 'Lock is already required')
})

testWithChain(
  tap
, 'Cannot refresh when there is already a refresh running'
, async (t, chain) => {
    const cache_connection = chain.lookup('#cache_connection')
    const exclusive_lock = new ExclusiveLock({
      log
    , name: chain.lookup('!random')
    , cache_connection
    , lock_ttl_ms: 2000
    , lock_refresh_ms: 10 // so we don't have to sleep so long in this test
    })

    t.teardown(async () => {
      exclusive_lock.is_refreshing = false
      await exclusive_lock.release()
    })

    cache_connection.pexpire = async () => {
      // Make sure to sleep longer that it will take before the next timer call
      await chain.sleep({ms: 100}).execute()
    }

    const refreshed_evt = t.eventPromise(exclusive_lock, 'refreshed', [], 'refreshed evt')

    await t.resolves(exclusive_lock.acquire(), 'Got the lock')
    await refreshed_evt
  }
)

testWithChain(tap, 'An error setting pexpire is gracefully handled', async (t, chain) => {
  const cache_connection = chain.lookup('#cache_connection')
  const exclusive_lock = new ExclusiveLock({
    log
  , name: chain.lookup('!random')
  , cache_connection
  })

  const pexpire = cache_connection.pexpire
  t.teardown(async (t) => {
    await exclusive_lock.release()
    cache_connection.pexpire = pexpire
  })
  // Do this so the `stack` passes a deep equals check
  const err = new Error('BOOM, something failed')
  cache_connection.pexpire = async () => {
    throw err
  }

  const error_evt = t.eventPromise(exclusive_lock, 'error', [
    err
  ], 'The error was emitted')
  const release_evt = t.eventPromise(exclusive_lock, 'released', [
    exclusive_lock.key
  ], 'The release was emitted after it errored')

  await t.resolves(exclusive_lock.acquire(), 'Got the lock')

  await error_evt
  await release_evt

  t.equal(exclusive_lock.is_refreshing, false, 'is_refreshing was reset even on error')
})

testWithChain(
  tap
, 'An error happens when trying to release AFTER a refresh error'
, async (t, chain) => {
    const cache_connection = chain.lookup('#cache_connection')
    const exclusive_lock = new ExclusiveLock({
      log
    , name: chain.lookup('!random')
    , cache_connection
    })

    const pexpire = cache_connection.pexpire
    const release = exclusive_lock.release
    t.teardown(async (t) => {
      exclusive_lock.release = release
      await exclusive_lock.release()
      cache_connection.pexpire = pexpire
    })
    // Do this so the `stack` passes a deep equals check
    const expire_err = new Error('BOOM, something failed')
    const release_err = new Error('wow, your cache store has major issues')
    cache_connection.pexpire = async () => {
      throw expire_err
    }
    exclusive_lock.release = async () => {
      throw release_err
    }

    const expire_error_evt = t.eventPromise(exclusive_lock, 'error', [
      expire_err
    ], 'The error was emitted for the pexpire')
    const release_error_evt = t.eventPromise(exclusive_lock, 'error', [
      release_err
    ], 'The release error emitted after pexpire errored')

    await t.resolves(exclusive_lock.acquire(), 'Got the lock')

    await expire_error_evt
    await release_error_evt

    t.equal(exclusive_lock.is_refreshing, false, 'is_refreshing was reset even on error')
  }
)
testWithChain(tap, 'release() throws errors', async (t, chain) => {
  const cache_connection = chain.lookup('#cache_connection')
  const exclusive_lock = new ExclusiveLock({
    log
  , name: chain.lookup('!random')
  , cache_connection
  , lock_ttl_ms: 600
  , lock_refresh_ms: 100
  })

  const del = cache_connection.del
  t.teardown(async () => {
    cache_connection.del = del
  })

  const err = new Error('NO DELETE FOR YOU!')
  cache_connection.del = async () => {
    throw err
  }

  await t.resolves(exclusive_lock.acquire(), 'Got a lock')
  await t.rejects(exclusive_lock.release(), err, 'Expected error is thrown')
  t.equal(exclusive_lock.acquired, false, 'acquired was reset despite the error')
})

testWithChain(tap, 'inspect handles errors', async (t, chain) => {
  const cache_connection = chain.lookup('#cache_connection')
  const exclusive_lock = new ExclusiveLock({
    log
  , name: chain.lookup('!random')
  , cache_connection
  })

  t.teardown(async () => {
    await exclusive_lock.release()
  })
  // Create it
  await t.resolves(exclusive_lock.acquire(), 'lock acquired')

  t.test('Handles an error with the .get command in the pipeline', async (t) => {
    const multiCmd = cache_connection.multi
    cache_connection.multi = function() {
      const multi = multiCmd.call(cache_connection)
      multi.exec = async function() {
        return [
          [new Error('BOOM! Fake GET error')]
        ]
      }
      return multi
    }

    t.teardown(() => {
      cache_connection.multi = multiCmd
    })

    await t.rejects(exclusive_lock.inspect(), {
      message: 'BOOM! Fake GET error'
    }, 'Expected error is thrown')
  })

  t.test('Handles an error with the .pttl command in the pipeline', async (t) => {
    const multiCmd = cache_connection.multi
    cache_connection.multi = function() {
      const multi = multiCmd.call(cache_connection)
      multi.exec = async function() {
        return [
          null
        , [new Error('BOOM! FAKE error in the TTL command')]
        ]
      }
      return multi
    }

    t.teardown(() => {
      cache_connection.multi = multiCmd
    })

    await t.rejects(exclusive_lock.inspect(), {
      message: 'BOOM! FAKE error in the TTL command'
    }, 'Expected error is thrown')
  })

  t.test('Handles when the pipeline returns a nullish result', async (t) => {
    const multiCmd = cache_connection.multi
    cache_connection.multi = function() {
      const multi = multiCmd.call(cache_connection)
      multi.exec = async function() {
        return null
      }
      return multi
    }

    t.teardown(() => {
      cache_connection.multi = multiCmd
    })

    const result = await exclusive_lock.inspect()
    t.same(result, {
      lock_ttl_ms: undefined
    , lock_contents: undefined
    }, 'Result was correct')
  })
})

teardown()
