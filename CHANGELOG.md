## Changelog

# [2.0.0](https://github.com/logdna/exclusive-lock-node/compare/v1.0.1...v2.0.0) (2022-07-25)


### Chores

* **lib**: Change the return value for `inspect` [7363db7](https://github.com/logdna/exclusive-lock-node/commit/7363db772ed120977c4e6d53622615313bb4bcc0) - Darin Spivey, closes: [#6](https://github.com/logdna/exclusive-lock-node/issues/6)


### **BREAKING CHANGES**

* **lib:** The function now returns a staic object with
properties for TTL and contents
* **lib:** `acquire` is no longer required to `inspect`

## [1.0.1](https://github.com/logdna/exclusive-lock-node/compare/v1.0.0...v1.0.1) (2022-07-08)


### Bug Fixes

* `debug` log level for `refresh()` is too noisy [90fa0a3](https://github.com/logdna/exclusive-lock-node/commit/90fa0a32436ef1e7c30f7790ead314b715c5f2c0) - Darin Spivey, closes: [#4](https://github.com/logdna/exclusive-lock-node/issues/4)

# 1.0.0 (2022-06-24)


### Build System

* **initial**: First version of the code (#2) [b1a3049](https://github.com/logdna/exclusive-lock-node/commit/b1a304913a7cc26ab9bb09ab6e68ebebfb893ef0) - GitHub, closes: [#2](https://github.com/logdna/exclusive-lock-node/issues/2) [#1](https://github.com/logdna/exclusive-lock-node/issues/1)


### Miscellaneous

* first commit [9cead34](https://github.com/logdna/exclusive-lock-node/commit/9cead349133fe76f395c8013175e379bd27829a2) - Darin Spivey


### **BREAKING CHANGES**

* **initial:** First version of the code (#2)
