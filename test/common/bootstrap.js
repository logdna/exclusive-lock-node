'use strict'

const {isDeepStrictEqual} = require('util')
const tap = require('tap')

if (require.main === module) {
  return tap.pass('skip...')
}
const setupChain = require('./setup-chain/index.js')
const log = require('./log.js')
const ExclusiveLock = require('../../index.js')

module.exports = {
  log
, setup
, setupChain
, teardown
, testWithChain
, ExclusiveLock
}

// This custom assertion handles creating a promise with `on` so that it can be used
// with `waitForPromise`. Doing this ensures good labels for when things fail as opposed
// to errors without context
tap.Test.prototype.addAssert('eventPromise', 3, function(...args) {
  const [emitter, event_name, payload = [], orig_message, extra] = args
  const message = orig_message + ` (${JSON.stringify(payload)})`

  const promise = new Promise((resolve) => {
    const listener_symbol = Symbol('eventPromise')
    // Trick to assign a symbol as a function name while still using arrow functions
    const fns = {
      [listener_symbol]: (...evt) => {
        evt.length = payload.length
        if (isDeepStrictEqual(evt, payload)) {
          emitter.removeListener(event_name, fns[listener_symbol])
          return resolve(payload)
        }
        this.comment(`${
          event_name
        } event did not match expected payload ${payload} (got ${evt})`)
      }
    }
    emitter.on(event_name, fns[listener_symbol])
  })
  return this.resolveMatch(promise, payload, message, extra)
})

function setup(fn) {
  return tap.test('setup', async (t) => {
    if (typeof fn === 'function') {
      await t.resolves(fn)
    }
  })
}

function teardown(chain, cb) {
  tap.test('teardown', async (t) => {
    if (chain) {
      await chain.teardown(t)
    }
    if (typeof cb === 'function') {
      await t.resolves(cb)
    }
  })
}

/**
 * Test Case Callback Function
 * @callback testCaseCallback
 * @param {tap['test']} t
 * @param {SetupChain} chain
 */
/**
 * Wrapper test function that allows us to not have to worry about chain teardown by
 * creating a chain prior to the test and returning it in the test's callback.
 * Once the test ends, teardown of the chain will automatically occur.
 * @async
 * @param {tap['test']} t The test parent
 * @param {string} name The test name
 * @param {testCaseCallback} fn The test callback
 */
async function testWithChain(t, name, fn, opts) {
  const chain = setupChain()

  await t.test(name, async (t) => {
    // Each test should have its own connection, otherwise parallel testing might not
    // work as the shared connection closing or being monkeypatched could cause flakiness.
    await chain
      .cacheConnection(opts, 'cache_connection')
      .execute()

    return fn(t, chain)
  })
  await chain.teardown(t, opts)
}
