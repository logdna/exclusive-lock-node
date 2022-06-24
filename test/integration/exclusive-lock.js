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

testWithChain(tap, 'Successful lock with default key_prefix', async (t, chain) => {
  const cache_connection = chain.lookup('#cache_connection')
  const lock_ttl_ms = 600
  const lock_refresh_ms = 50

  const exclusive_lock = new ExclusiveLock({
    name: 'some deployment "name" with spaces'
  , cache_connection
  , log
  , lock_ttl_ms
  , lock_refresh_ms
  })

  t.equal(
    exclusive_lock.key,
    'exclusive-lock:some-deployment-name-with-spaces'
  , 'The key was slugified'
  )

  const acquired_evt = t.eventPromise(exclusive_lock, 'acquired', [
    exclusive_lock.key
  ], 'Got the acquired event')

  const refreshed_evt = t.eventPromise(exclusive_lock, 'refreshed', [
    {
      key: exclusive_lock.key
    , lock_ttl_ms
    }
  ], 'Got the refreshed event')

  await t.resolves(exclusive_lock.acquire(), 'Got a lock')

  await acquired_evt
  await refreshed_evt

  const multi = cache_connection
    .multi()
    .get(exclusive_lock.key)
    .pttl(exclusive_lock.key)

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

  t.equal(exclusive_lock.acquired, true, 'acquired is set')
  t.equal(exclusive_lock.lock_ttl_ms, lock_ttl_ms, 'lock_ttl_ms was saved')
  t.equal(exclusive_lock.lock_refresh_ms, lock_refresh_ms, 'lock_refresh_ms was saved')
  t.ok(exclusive_lock.refresh_timer, 'A refresh timer is started')

  await chain.sleep({ms: 200}).execute()
  const refreshed_ttl = await cache_connection.pttl(exclusive_lock.key)
  const refreshed_diff = lock_ttl_ms - ttl
  t.ok(ttl_diff <= 100, 'The TTL has been refreshed via a timer', {
    refreshed_diff
  , refreshed_ttl
  , lock_ttl_ms
  , lock_refresh_ms
  })

  const released_evt = t.eventPromise(exclusive_lock, 'released', [
    exclusive_lock.key
  ], 'Got the released event')

  await t.resolves(exclusive_lock.release(), 'Unlocked')
  await released_evt

  t.equal(exclusive_lock.acquired, false, 'acquired was reset')
  t.equal(exclusive_lock.refresh_timer, null, 'refresh_timer was killed')
  t.same(
    await cache_connection.get(exclusive_lock.key)
  , null
  , 'The lock file was removed'
  )
})

testWithChain(tap, 'Specifying key_prefix uses it in the lock name', async (t, chain) => {
  const name = chain.lookup('!random')
  const exclusive_lock = new ExclusiveLock({
    name
  , cache_connection: chain.lookup('#cache_connection')
  , key_prefix: 'my-special-key   with  spaces'
  })

  t.equal(exclusive_lock.key, `my-special-key-with-spaces:${name}`, 'key name is correct')
})

testWithChain(tap, 'Only 1 competing resource gets the lock', async (t, chain) => {
  const name = chain.lookup('!random')
  const cache_connection = chain.lookup('#cache_connection')
  const lock_ttl_ms = 600
  const lock_refresh_ms = 50

  const instance_1 = new ExclusiveLock({
    name
  , cache_connection
  , log
  , lock_ttl_ms
  , lock_refresh_ms
  })
  const instance_2 = new ExclusiveLock({
    name
  , cache_connection
  , log
  , lock_ttl_ms
  , lock_refresh_ms
  })

  await t.resolves(Promise.all([
    instance_1.acquire()
  , instance_2.acquire()
  ]), 'Both instances try and get a lock at the same time')

  if (instance_1.acquired && instance_2.acquired) {
    t.fail('Only 1 instance should have gotten the lock')
  }
  if (!instance_1.acquired && !instance_2.acquired) {
    t.fail('Neither instance got a lock...why?')
  }
  t.ok(
    instance_1.acquired || instance_2.acquired
  , 'One instance got the lock'
  )

  let locked_instance
  let unlocked_instance
  if (instance_1.acquired) {
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

    t.equal(locked_instance.acquired, false, 'acquired was cleaned up')
    t.equal(locked_instance.refresh_timer, null, 'refresh_timer was stopped')
  })
  t.test('The instance without a lock cleans up properly on stop()', async (t) => {
    await t.resolves(unlocked_instance.release(), 'Unlock success')

    t.equal(unlocked_instance.acquired, false, 'acquired is still false')
    t.equal(unlocked_instance.refresh_timer, null, 'refresh_timer is still null')
  })
})

testWithChain(tap, 'The lock contents can be specified', async (t, chain) => {
  const lock_contents = 'some sort of meta information here'

  const exclusive_lock = new ExclusiveLock({
    name: chain.lookup('!random')
  , cache_connection: chain.lookup('#cache_connection')
  , log
  , auto_refresh: false
  , lock_contents
  })

  t.teardown(async () => {
    await exclusive_lock.release()
  })

  await exclusive_lock.acquire()
  const result = await exclusive_lock.inspect()
  t.same(result, lock_contents, 'String contents was correct')
})

testWithChain(tap, 'toString() returns our class\'s name', async (t, chain) => {
  const exclusive_lock = new ExclusiveLock({
    name: chain.lookup('!random')
  , cache_connection: chain.lookup('#cache_connection')
  })

  t.equal(
    exclusive_lock.toString()
  , '[object ExclusiveLock]'
  , '.toString() returned the class name'
  )
})

teardown()
