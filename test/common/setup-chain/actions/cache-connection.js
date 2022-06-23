'use strict'

// To faciliate parallel testing, we cannot always share a connection or monkeypatching
// one test can bleed into another test

const Redis = require('ioredis')
const log = require('../../log.js').child({module: 'cache-connection'})
const CACHE_HOST = process.env.CACHE_HOST

module.exports = async function cacheConnection(opts) {
  const {
    cache_auto_connect = true
  } = opts ?? {}

  const keydb = new Redis(6379, CACHE_HOST, {
    enableReadyCheck: true
  , lazyConnect: !!cache_auto_connect
  , enableOfflineQueue: true
  })

  keydb.on('connect', () => {
    log.info(`Connected to keydb: ${CACHE_HOST}`)
  })

  /* istanbul ignore next */
  keydb.on('error', (err) => {
    process.nextTick(() => {
      throw err
    })
  })

  if (cache_auto_connect) {
    await keydb.connect()
  }

  this.register('cache_connections', keydb)

  return keydb
}
