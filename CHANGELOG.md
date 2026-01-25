## [1.9.1](https://github.com/nicholaspsmith/lance-context/compare/v1.9.0...v1.9.1) (2026-01-25)


### Bug Fixes

* type progressUpdates array in indexer test ([#59](https://github.com/nicholaspsmith/lance-context/issues/59)) ([59b3335](https://github.com/nicholaspsmith/lance-context/commit/59b3335555be8d1699c440011963ad52beabd083))

# [1.9.0](https://github.com/nicholaspsmith/lance-context/compare/v1.8.1...v1.9.0) (2026-01-25)


### Features

* validate checkpoint freshness before resuming ([#56](https://github.com/nicholaspsmith/lance-context/issues/56)) ([1252bf0](https://github.com/nicholaspsmith/lance-context/commit/1252bf06c16b824cb651dd5115866116aec52e20))

## [1.8.1](https://github.com/nicholaspsmith/lance-context/compare/v1.8.0...v1.8.1) (2026-01-25)


### Bug Fixes

* add bounds to dashboard state and SSE connections ([#55](https://github.com/nicholaspsmith/lance-context/issues/55)) ([9fb3750](https://github.com/nicholaspsmith/lance-context/commit/9fb3750525baa3d602855e58c2b151a0a3b9665b))

# [1.8.0](https://github.com/nicholaspsmith/lance-context/compare/v1.7.0...v1.8.0) (2026-01-25)


### Features

* add checksum-based cache invalidation for clustering ([#54](https://github.com/nicholaspsmith/lance-context/issues/54)) ([c6e6e33](https://github.com/nicholaspsmith/lance-context/commit/c6e6e33a910bb73d4c23c95f6fb1e10a852a355e))

# [1.7.0](https://github.com/nicholaspsmith/lance-context/compare/v1.6.0...v1.7.0) (2026-01-25)


### Features

* add configurable rate limiting for embedding batches ([#53](https://github.com/nicholaspsmith/lance-context/issues/53)) ([0775b5f](https://github.com/nicholaspsmith/lance-context/commit/0775b5fb9ef79d6366b8c1bf2e52ec509ebad757))

# [1.6.0](https://github.com/nicholaspsmith/lance-context/compare/v1.5.0...v1.6.0) (2026-01-25)


### Features

* add reusable TTLCache utility class ([#52](https://github.com/nicholaspsmith/lance-context/issues/52)) ([45c34f0](https://github.com/nicholaspsmith/lance-context/commit/45c34f0e5a912eab323e6eb797e97fa16be3914c))

# [1.5.0](https://github.com/nicholaspsmith/lance-context/compare/v1.4.2...v1.5.0) (2026-01-25)


### Features

* track and report AST parsing fallbacks ([#51](https://github.com/nicholaspsmith/lance-context/issues/51)) ([13c0590](https://github.com/nicholaspsmith/lance-context/commit/13c0590825f62aaa3ed78bb23a86642ee14463ff))

## [1.4.2](https://github.com/nicholaspsmith/lance-context/compare/v1.4.1...v1.4.2) (2026-01-25)


### Bug Fixes

* use spawn for safer git command execution ([#50](https://github.com/nicholaspsmith/lance-context/issues/50)) ([ce06ccf](https://github.com/nicholaspsmith/lance-context/commit/ce06ccf3774eb85593227d2d630ae27639420c38))

## [1.4.1](https://github.com/nicholaspsmith/lance-context/compare/v1.4.0...v1.4.1) (2026-01-25)


### Bug Fixes

* add TTL expiration to query embedding cache ([#49](https://github.com/nicholaspsmith/lance-context/issues/49)) ([c74b3e3](https://github.com/nicholaspsmith/lance-context/commit/c74b3e345087f63067a29a0b734f8578e4ba20c1))
* **security:** sanitize chunk IDs in clustering queries ([#48](https://github.com/nicholaspsmith/lance-context/issues/48)) ([b4a79ff](https://github.com/nicholaspsmith/lance-context/commit/b4a79ff37f922cf189acb10882c94a3b42d93eb0))

# [1.4.0](https://github.com/nicholaspsmith/lance-context/compare/v1.3.0...v1.4.0) (2026-01-25)


### Features

* **dashboard:** add bidirectional hover and sort chart by usage ([#47](https://github.com/nicholaspsmith/lance-context/issues/47)) ([8851982](https://github.com/nicholaspsmith/lance-context/commit/88519821b7d4079159910e621ea827cbdeb0c165))

# [1.3.0](https://github.com/nicholaspsmith/lance-context/compare/v1.2.1...v1.3.0) (2026-01-25)


### Features

* **dashboard:** improve usage chart with dynamic legend ([#46](https://github.com/nicholaspsmith/lance-context/issues/46)) ([46b183d](https://github.com/nicholaspsmith/lance-context/commit/46b183db77e5352b5abbd642703a105005f4b936))

## [1.2.1](https://github.com/nicholaspsmith/lance-context/compare/v1.2.0...v1.2.1) (2026-01-24)


### Bug Fixes

* remove duplicate labels from usage chart ([d865476](https://github.com/nicholaspsmith/lance-context/commit/d8654762ab22444b76333fe02c61da072af172fc))

# [1.2.0](https://github.com/nicholaspsmith/lance-context/compare/v1.1.0...v1.2.0) (2026-01-24)


### Features

* add checkpoint-based indexing for crash recovery ([#45](https://github.com/nicholaspsmith/lance-context/issues/45)) ([e95f0d5](https://github.com/nicholaspsmith/lance-context/commit/e95f0d566e7dda01459055f5edee71120d6ffd85))

# [1.1.0](https://github.com/nicholaspsmith/lance-context/compare/v1.0.1...v1.1.0) (2026-01-24)


### Features

* **dashboard:** display package version in header ([#41](https://github.com/nicholaspsmith/lance-context/issues/41)) ([5015f81](https://github.com/nicholaspsmith/lance-context/commit/5015f81e8215e71c9f7ff9f4fcaf5ed1b50901a8))

## [1.0.1](https://github.com/nicholaspsmith/lance-context/compare/v1.0.0...v1.0.1) (2026-01-23)


### Bug Fixes

* **dashboard:** add all tools to usage tracking ([#39](https://github.com/nicholaspsmith/lance-context/issues/39)) ([ae1a0cb](https://github.com/nicholaspsmith/lance-context/commit/ae1a0cbaad4469b78bb6a6df7dfa3d84099571d0))

# 1.0.0 (2026-01-23)


### Bug Fixes

* **dashboard:** show restart indicator when backend config differs from running ([#27](https://github.com/nicholaspsmith/lance-context/issues/27)) ([89b8f77](https://github.com/nicholaspsmith/lance-context/commit/89b8f775030bf0449a717a890567498c8296eb63))
* **hooks:** allow CI commits to main for semantic-release ([#37](https://github.com/nicholaspsmith/lance-context/issues/37)) ([8a46d16](https://github.com/nicholaspsmith/lance-context/commit/8a46d1634d67bd3aaf6ba3904983d8621d0ebe25))
* **index:** load secrets for embedding backend selection ([#28](https://github.com/nicholaspsmith/lance-context/issues/28)) ([fba3e74](https://github.com/nicholaspsmith/lance-context/commit/fba3e74ed991c5a543c4381d30569510acca4a90))


### Features

* add checkpoint-based indexing for large codebases ([#32](https://github.com/nicholaspsmith/lance-context/issues/32)) ([060a5a5](https://github.com/nicholaspsmith/lance-context/commit/060a5a55d9b62799d894e3505e05c9eabde6e44e))
* add concept clustering and codebase summarization ([#33](https://github.com/nicholaspsmith/lance-context/issues/33)) ([d3916f2](https://github.com/nicholaspsmith/lance-context/commit/d3916f23dda4bcbd973f75842bb81da47d5009ae))
* add Serena-like symbolic code analysis tools ([#29](https://github.com/nicholaspsmith/lance-context/issues/29)) ([8184ae1](https://github.com/nicholaspsmith/lance-context/commit/8184ae19ff4d1585c191a02326d6ea0db124126b))
* auto-reindex on backend change and semantic versioning ([#36](https://github.com/nicholaspsmith/lance-context/issues/36)) ([21fca80](https://github.com/nicholaspsmith/lance-context/commit/21fca800d08cdbc201b42f045755c0029a8c71eb))
* **config:** improve validation with field-level error recovery ([#26](https://github.com/nicholaspsmith/lance-context/issues/26)) ([e83022d](https://github.com/nicholaspsmith/lance-context/commit/e83022d2294ed929bb0b67b145b1a3c50a4a2c3a))
* **dashboard:** add expandable descriptions for beads issues ([#24](https://github.com/nicholaspsmith/lance-context/issues/24)) ([9227322](https://github.com/nicholaspsmith/lance-context/commit/9227322ec208652e8f34afe260795567fd8ed08c))
* **embeddings:** add smart batching for large embedding operations ([#22](https://github.com/nicholaspsmith/lance-context/issues/22)) ([2a2e7dd](https://github.com/nicholaspsmith/lance-context/commit/2a2e7dd529f9bd94e853cb5c7bb480b41e706340))
* **index:** add corruption detection and auto-repair ([#34](https://github.com/nicholaspsmith/lance-context/issues/34)) ([5ce3036](https://github.com/nicholaspsmith/lance-context/commit/5ce30360b0e2dfad55421043f8abecb8ce3b33de))
* **indexer:** parallelize file processing during indexing ([#23](https://github.com/nicholaspsmith/lance-context/issues/23)) ([773ac46](https://github.com/nicholaspsmith/lance-context/commit/773ac46114fb262ddc62b9636a1e1437bae1dd1a))
