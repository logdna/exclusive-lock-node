'use strict'

const BaseClass = require('@logdna/setup-chain')
const actions = require('./actions/index.js')

class SetupChain extends BaseClass {
  constructor(state) {
    super({
      ...state
    }, actions)
    this.cache_connections = []
  }

  async teardown() {
    for (const conn of this.cache_connections) {
      await conn.disconnect()
    }
  }

  $now() {
    return Date.now()
  }

  register(name, obj) {
    if (!this[name]) {
      const err = new Error(`setupChain cannot register unknown thing: ${name}`)
      throw err
    }
    this[name].push(obj)
  }
}

module.exports = function setupChain(state) {
  return new SetupChain(state)
}
