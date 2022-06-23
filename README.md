<!-- TOC -->

- [`ExclusiveLock`](#exclusivelock)
  - [NOTES](#notes)
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
- [Contributing](#contributing)

<!-- /TOC -->
## `ExclusiveLock`

Need to synchronize a bunch of workers so that only 1 does a particular thing?  If yes,
then you need a lock file.  This package uses a cache store (`redis` or `keydb`)
to create records atomically that only 1 instance will "own."

### NOTES

This library covers most common use cases for exclusion when working with multiple instances of the same application / container:

* Exclusive initialization: have one of the application instances perform a task on init.
* Periodic checks: Have one of the application instances perform a task periodically.

For long running tasks and rare edge cases, it could be possible that the lock is perceived as acquired by more than one instance. This library does not provide strict guarantees for exclusion for tasks that must be processed exactly once in a non-idempotent manner (e.g. appending an item in order processing). Consider using upserts/cas on your persistent DB in those cases or using a dedicated solution for exclusion like etcd / zookeeper.

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
  name: 'my-distributed-app'
, log: pino()
, cache_manager
})

async function main() {
  const acquired = await exclusive_lock.acquire()
  if (acquired) {
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
  * `name` [`<String>`][] - A unique string to identify your application
  * `log` [`<Object>`][] - A `pino` logger instance. Must support levels `info`, `warn`, `error`, `debug`
  * `cache_connection` [`<Object>`][] - A connection to the cache, either Redis or Keydb
  * `lock_ttl_ms` [`<Number>`][] - Optional. Specify a TTL in milliseconds for the   lock.  **Default: 3000**
  * `lock_refres_ms` [`<Number>`][] - Optional. specify a time in milliseconds for refreshing the lock on an interval. **Default: 1000**
  * `lock_contents` [`<String>`][] - Optional. Specify the string contents to put in the lock file, e.g. a server/instance name.
  * `auto_refresh` [`<Boolean>`][] - When `true`, it automatically refreshes the lock TTL on an interval, every `lock_refresh_ms`.
    When `false`, it is up to the user to call `refresh()` if desired. **Default: true**

  Throws: [`<Error>`][] for validation errors

### `acquire()`

Attempts to exclusively acquire a lock based on the given `name`. If multiple
instances are competing, only 1 will win the lock.

Returns: `Promise<Boolean>` if the lock was a success

### `inspect()`

Returns the contents of the lock. Useful if `lock_contents` was used to store
valuable information in the lock.

Returns: `Promise<Object|Number|Boolean|String>` The contents of the lock

### `release()`

Unlock based on `name`.  Idempotent.  Instances that do not have the lock will
be a no-op.

Returns: `Promise<undefined>`

### `refresh()`

This refreshes the lock's TTL and can be repeatedly run to ensure that the TTL on the lock doesn't prematurely expire. There is no need to manually run this unless `auto_refresh` has been manually set to `false`. It is also idempotent.
## Authors

* [**Darin Spivey**](mailto:darin.spivey@mezmo.com) &lt;darin.spivey@mezmo.com&gt;

## License

Copyright © 2022 [Mezmo](https://mezmo.com), released under an MIT license. See the [LICENSE](./LICENSE) file and https://opensource.org/licenses/MIT

## Contributing

This project is open-sourced, and accepts PRs from the public for bugs or feature
enhancements. These are the guidelines for contributing:

* The project uses [Commitlint][] and enforces [Conventional Commit Standard][]. Please format your commits based on these guidelines.
* An [issue must be opened](https://github.com/logdna/exclusive-lock-node/issues) in the repository for any bug, feature, or anything else that will have a PR
  * The commit message must reference the issue with an [acceptable action tag](https://github.com/logdna/commitlint-config-mezmo/blob/41aef3b69f292e39fb41a5ef24bcd7043e0fceb3/index.js#L12-L20) in the commit footer, e.g. `Fixes: #5`


[`<Boolean>`]: https://mdn.io/boolean
[`<Number>`]: https://mdn.io/number
[`<Object>`]: https://mdn.io/object
[`<String>`]: https://mdn.io/string
[`<Array>`]: https://mdn.io/array
[`<Promise>`]: https://mdn.io/promise
[`<Error>`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
[Commitlint]: https://commitlint.js.org
[Conventional Commit Standard]: https://www.conventionalcommits.org/en/v1.0.0/
