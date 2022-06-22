'use strict'

const pino = require('pino')

let transport
if (!!process.env.LOGPRETTY) {
  transport = {
    target: 'pino-pretty'
  , options: {
      colorize: true
    , levelFirst: true
    , translateTime: true
    , errorProps: 'code,meta'
    , destination: 2
    , errorLikeObjectKeys: 'er,err,error'
    , messageKey: 'message'
    }
  }
}

module.exports = pino({
  name: 'test-logger'
, level: process.env.LOGLEVEL || 'silent'
, messageKey: 'message'
, transport
, formatters: {
    level(label) {
      return {level: label}
    }
  , bindings(values) {
      return {name: values.name}
    }
  }
}, pino.destination(process.stderr))
