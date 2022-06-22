<!-- TOC -->

- [`ExclusiveLock`](#exclusivelock)
- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
  - [`new ExclusiveLock(options)`](#new-exclusivelockoptions)
  - [`acquire()`](#acquire)
  - [`inspect()`](#inspect)
  - [`release()`](#release)
  - [`refresh()`](#refresh)
- [Authors](#authors)
- [License](#license)

<!-- /TOC -->
## `ExclusiveLock`

Need to synchronize a bunch of workers so that only 1 does a particular thing?  If yes,
then you need a lock file.  This package uses a cache store (`redis` or `keydb`)
to create records atomically that only 1 instance will "own."
## Installation

```bash
npm install @logdna/exclusive-lock --save
```

## Usage

```js
const ExclusiveLock = require('@logdna/exclusive-lock')
const cache_connection = require('./my-keydb-connection.js')
const pino = require('pino')

const exclusive_lock = new ExclusiveLock({
  app_name: 'my-distributed-app'
, log: pino()
, cache_manager
})

async function main() {
  const got_lock = await exclusive_lock.acquire()
  if (got_lock) {
    log.info('You win the race! Lock acquired')
  }
  exclusive_lock.release()
}

main()
```

## API

-------

### `new ExclusiveLock(options)`
* `options` [`<Object>`][]
  * `app_name` [`<String>`][] - A unique string to identify your application
  * `log` [`<Object>`][] - A pino instance for logging
  * `cache_connection` [`<Object>`][] - A connection to the cache, either Redis or Keydb
  * `lock_ttl_ms` [`<Number>`][] - Optional. Specify a TTL in milliseconds for the   lock.  **Default: 3000***
  * `lock_refres_ms` [`<Number>`][] - Optional. specify a time in milliseconds for refreshing the lock on an interval. **Default: 1000**
  * `lock_contents` [`<Object>`][]|[`<Number>`][] |[`<Boolean>`][] |[`<String>`][] -
    Optional. Specify the contents to put in the lock file, e.g. a server/instance name.
  * `auto_refresh` [`<Boolean>`][] - Option. Do not automatically refresh the lock TTL on an interval. **Default: true**

  Throws: [`<Error>`][] for validation errors

### `acquire()`

Attempts to exclusively acquire a lock based on the given `app_name`. If multiple
instances are competing, only 1 will win the lock.

Returns: `Promise<Boolean>` if the lock was a success

### `inspect()`

Returns the contents of the lock. Useful if `lock_contents` was used to store
valuable information in the lock.

Returns: `Promise<Object|Number|Boolean|String>` The contents of the lock

### `release()`

Unlock based on `app_name`.  Idempotent.  Instances that do not have the lock will
be a no-op.

Returns: `Promise<undefined>`

### `refresh()`

This refreshes the lock's TTL and can be repeatedly run to ensure that the TTL on the lock doesn't prematurely expire. There is no need to manually run this unless `auto_refresh` has been manually set to `false`. It is also idempotent.
## Authors

* [**Darin Spivey**](mailto:darin.spivey@mezmo.com) &lt;darin.spivey@mezmo.com&gt;

[Commitlint]: https://commitlint.js.org
[Conventional Commit Standard]: https://www.conventionalcommits.org/en/v1.0.0/

## License

Copyright © 2022 [Mezmo](https://mezmo.com), released under an MIT license. See the [LICENSE](./LICENSE) file and https://opensource.org/licenses/MIT


[`<Boolean>`]: https://mdn.io/boolean
[`<Number>`]: https://mdn.io/number
[`<Object>`]: https://mdn.io/object
[`<String>`]: https://mdn.io/string
[`<Array>`]: https://mdn.io/array
[`<Promise>`]: https://mdn.io/promise
[`<Error>`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
