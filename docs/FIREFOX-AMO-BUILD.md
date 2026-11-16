# Building the FeedSieve Firefox fork

This archive contains the source for the `faketrader/feedsieve` Firefox fork.
Its Gecko ID is `feedsieve@faketrader.github.io`, preserving the existing fork's
extension identity and local storage. The manifest declares Firefox 140 and
Android 142 as minimum versions. Android still needs device verification.

## Requirements

- Node.js >= 22
- pnpm 11 (`corepack enable` picks the version from `package.json`)
- Network access for dependency installation

## Build

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @feedsieve/extension build:firefox
pnpm check:extension:firefox
```

The unpacked extension is written to `apps/extension/.output/firefox-mv3/`.
`pnpm install` runs `scripts/copy-runtime-data.mjs` and `wxt prepare`; the build
command copies the same data again before running WXT.

To create the extension ZIP and complete source ZIP:

```sh
pnpm --filter @feedsieve/extension zip:firefox
pnpm check:extension:firefox
```

Both archives are written to `apps/extension/.output/` as
`feedsieve-<version>-firefox.zip` and `feedsieve-<version>-sources.zip`.

## Archive contents

- `apps/extension/` — extension entrypoints, UI, content scripts and build config
- `packages/` — workspace libraries used by the extension
  (`@feedsieve/detector`, `metrics`, `x-adapter`, `community-lists`, `shared`,
  `block-queue`)
- `community/` — public list snapshot and keyword-pack data copied into the
  extension at build time
- `apps/extension/src/lib/detection/variant-tables.json` — variant mapping data
- `scripts/check-firefox.mjs` — manifest and entrypoint validation
- lockfile, workspace config, TypeScript configs, license and privacy policy

Dependency directories, hidden build folders (`.output` and `.wxt`) and local
environment files are excluded from the archive.

The archive contains no local environment files. Production builds use the fixed
upstream API at `https://api.feedsieve.win`. The `FEEDSIEVE_API_BASE` override is
used only in development builds.

## Runtime notes for reviewers

- The extension makes no remote code requests. All JavaScript is bundled in the
  submitted package.
- It reads only pages on `x.com` (host permission `https://x.com/*`).
- It talks to the project's own API at `https://api.feedsieve.win` with ordinary
  CORS requests; no host permission is requested for it.
- The Firefox sidebar opens `popup.html?panel=1` and stays closed at installation.
- The AI-flavor check (only after an explicit click) sends up to 20 public
  replies of one account to the project's API, which forwards the text once to a
  third-party language-model service for scoring. Full details are in
  `PRIVACY.md`.
- Scheduling and article editing happen locally; the extension never confirms or
  publishes on the user's behalf.

[Fork support](https://github.com/faketrader/feedsieve/issues)

The upstream project's AMO release uses the separate Gecko ID
`feedsieve-official@feedsieve.win`. Its release history is documented in the
[upstream Firefox guide](https://github.com/realchendahuang/feedsieve/blob/v0.18.1/docs/FIREFOX.md).
