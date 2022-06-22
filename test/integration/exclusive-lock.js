'use strict'

const tap = require('tap')
const bootstrap = require('../common/bootstrap.js')

const {
  setup
, teardown
, testWithChain
, log
, ExclusiveLock
} = bootstrap

setup()

testWithChain(tap, 'Successful lock', async (t, chain) => {
  const cache_connection = chain.lookup('#cache_connection')
  const lock_ttl_ms = 600
  const lock_refresh_ms = 50

  const exclusive_lock = new ExclusiveLock({
    app_name: 'some deployment "name" with spaces'
  , log
  , cache_connection
  , lock_ttl_ms
  , lock_refresh_ms
  })

  t.equal(
    exclusive_lock.lock_name,
    'lock-manager:some-deployment-name-with-spaces'
  , 'The lock_name was slugified'
  )

  await t.resolves(exclusive_lock.acquire(), 'Got a lock')

  const multi = cache_connection
    .multi()
    .get(exclusive_lock.lock_name)
    .pttl(exclusive_lock.lock_name)

  const [
    [, contents]
  , [, ttl]
  ] = await multi.exec()

  t.same(contents, 1, 'Default cache contents were correct')
  const ttl_diff = lock_ttl_ms - ttl
  t.ok(ttl_diff <= 100, 'TTL is set correctly', {
    ttl_diff
  , ttl
  , lock_ttl_ms
  })

  t.equal(exclusive_lock.got_lock, true, 'got_lock is set')
  t.equal(exclusive_lock.lock_ttl_ms, lock_ttl_ms, 'lock_ttl_ms was saved')
  t.equal(exclusive_lock.lock_refresh_ms, lock_refresh_ms, 'lock_refresh_ms was saved')
  t.ok(exclusive_lock.refresh_timer, 'A refresh timer is started')

  await chain.sleep({ms: 200}).execute()
  const refreshed_ttl = await cache_connection.pttl(exclusive_lock.lock_name)
  const refreshed_diff = lock_ttl_ms - ttl
  t.ok(ttl_diff <= 100, 'The TTL has been refreshed via a timer', {
    refreshed_diff
  , refreshed_ttl
  , lock_ttl_ms
  , lock_refresh_ms
  })

  await t.resolves(exclusive_lock.release(), 'Unlocked')

  t.equal(exclusive_lock.got_lock, false, 'got_lock was reset')
  t.equal(exclusive_lock.refresh_timer, null, 'refresh_timer was killed')
  t.same(
    await cache_connection.get(exclusive_lock.lock_name)
  , null
  , 'The lock file was removed'
  )
})

testWithChain(tap, 'Only 1 competing resource gets the lock', async (t, chain) => {
  const app_name = chain.lookup('!random')
  const cache_connection = chain.lookup('#cache_connection')
  const lock_ttl_ms = 600
  const lock_refresh_ms = 50

  const instance_1 = new ExclusiveLock({
    app_name
  , log
  , cache_connection
  , lock_ttl_ms
  , lock_refresh_ms
  })
  const instance_2 = new ExclusiveLock({
    app_name
  , log
  , cache_connection
  , lock_ttl_ms
  , lock_refresh_ms
  })

  await t.resolves(Promise.all([
    instance_1.acquire()
  , instance_2.acquire()
  ]), 'Both instances try and get a lock at the same time')

  if (instance_1.got_lock && instance_2.got_lock) {
    t.fail('Only 1 instance should have gotten the lock')
  }
  if (!instance_1.got_lock && !instance_2.got_lock) {
    t.fail('Neither instance got a lock...why?')
  }
  t.ok(
    instance_1.got_lock || instance_2.got_lock
  , 'One instance got the lock'
  )

  let locked_instance
  let unlocked_instance
  if (instance_1.got_lock) {
    locked_instance = instance_1
    unlocked_instance = instance_2
  } else {
    locked_instance = instance_2
    unlocked_instance = instance_1
  }

  t.ok(
    locked_instance.refresh_timer
  , 'A refresh_timer was started for the instance that got the lock'
  )
  t.same(
    unlocked_instance.refresh_timer
  , null
  , 'No refresh_timer was started for the instance that did not get the lock'
  )

  t.test('The locked instance cleans up properly on stop()', async (t) => {
    await t.resolves(locked_instance.release(), 'Unlock success')

    t.equal(locked_instance.got_lock, false, 'got_lock was cleaned up')
    t.equal(locked_instance.refresh_timer, null, 'refresh_timer was stopped')
  })
  t.test('The instance without a lock cleans up properly on stop()', async (t) => {
    await t.resolves(unlocked_instance.release(), 'Unlock success')

    t.equal(unlocked_instance.got_lock, false, 'got_lock is still false')
    t.equal(unlocked_instance.refresh_timer, null, 'refresh_timer is still null')
  })
})

testWithChain(tap, 'If desired, can turn off the refresh timer', async (t, chain) => {
  const exclusive_lock = new ExclusiveLock({
    app_name: chain.lookup('!random')
  , log
  , cache_connection: chain.lookup('#cache_connection')
  , auto_refresh: false
  })

  t.teardown(async () => {
    await exclusive_lock.release()
  })

  await t.resolves(exclusive_lock.acquire(), 'Got the lock')

  t.equal(exclusive_lock.refresh_timer, null, 'A timer was NOT set')
})

testWithChain(tap, 'The lock contents can be specified', async (t, chain) => {
  const cache_connection = chain.lookup('#cache_connection')

  t.afterEach(async () => {
    await t.context.exclusive_lock.release()
  })

  t.test('Contents can be a number', async (t) => {
    const lock_contents = 12345
    const exclusive_lock = new ExclusiveLock({
      app_name: chain.lookup('!random')
    , log
    , cache_connection
    , auto_refresh: false
    , lock_contents
    })

    t.parent.context.exclusive_lock = exclusive_lock

    await exclusive_lock.acquire()
    const result = await exclusive_lock.inspect()
    t.same(result, lock_contents, 'Numeric contents was correct')
  })

  t.test('Contents can be an object', async (t) => {
    const lock_contents = {pod_name: 'abc123', my_date: new Date()}
    const exclusive_lock = new ExclusiveLock({
      app_name: chain.lookup('!random')
    , log
    , cache_connection
    , auto_refresh: false
    , lock_contents
    })

    t.parent.context.exclusive_lock = exclusive_lock

    await exclusive_lock.acquire()
    const result = await exclusive_lock.inspect()
    t.same(result, lock_contents, 'Object contents was correct')
  })

  t.test('Contents can be a boolean', async (t) => {
    const lock_contents = true
    const exclusive_lock = new ExclusiveLock({
      app_name: chain.lookup('!random')
    , log
    , cache_connection
    , auto_refresh: false
    , lock_contents
    })

    t.parent.context.exclusive_lock = exclusive_lock

    await exclusive_lock.acquire()
    const result = await exclusive_lock.inspect()
    t.same(result, lock_contents, 'Boolean contents was correct')
  })

  t.test('Contents can be a string', async (t) => {
    const lock_contents = 'some sort of meta information here'
    const exclusive_lock = new ExclusiveLock({
      app_name: chain.lookup('!random')
    , log
    , cache_connection
    , auto_refresh: false
    , lock_contents
    })

    t.parent.context.exclusive_lock = exclusive_lock

    await exclusive_lock.acquire()
    const result = await exclusive_lock.inspect()
    t.same(result, lock_contents, 'String contents was correct')
  })
})

teardown()
