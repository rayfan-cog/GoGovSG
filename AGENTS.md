# AGENTS.md

GoGovSG: Express + Sequelize/Postgres + Redis backend (`src/server`), React client (`src/client`), shared code (`src/shared`). Default branch is `develop`.

## Toolchain

- Node **24** (`.nvmrc`, `engines`) and pnpm **12.0.0** (`packageManager`). README's "node version 18" is stale: Node 18's bundled corepack cannot install pnpm 12.
- Get pnpm via corepack (`corepack enable`) or any pnpm that honours `packageManager` (it self-switches to 12.0.0). Check with `node -v && pnpm -v`.
- `pnpm install --frozen-lockfile` (what CI runs, ~15 s). `pnpm-workspace.yaml` uses the hoisted linker and a `minimumReleaseAge`/trust policy, so a freshly published dependency version can be refused on install.

## Checks CI runs (`.github/workflows/ci.yml`), no docker needed

```sh
pnpm run lint          # oxlint --type-aware; prints many no-deprecated warnings but exits 0
pnpm run format:check  # oxfmt; fix with `pnpm run format`
pnpm run typecheck     # tsc on tsconfig.json and tsconfig.client.json
pnpm run test          # jest + @swc/jest, ~4 s; noisy console logs are expected
ASSET_VARIANT=gov pnpm run build   # ~25 s, outputs build/ (server) and dist/ (client)
```

- `ASSET_VARIANT` (`gov`, `edu` or `health`) is required for `build`: without it webpack fails with `Error: Invalid variant name!` from `src/shared/util/asset-variant.ts`.
- Unit tests live in `test/{server,client,shared}` and `src/**/__tests__`.

## Integration and E2E (docker stack)

`docker-compose.yml` runs the app plus postgres, redis, floci (S3 emulator, :4566) and maildev (SMTP + UI on :1080). It sets all env vars itself, so no `.env` or secrets are needed. Cloudmersive and Safe Browsing no-op without keys.

- Integration (`test/integration`, hits the API directly):
  ```sh
  pnpm run dev:server-only &   # Express only on :8080, ready in ~1.5 min on a cold build
  # ready when http://localhost:8080/api/user/message answers (401 is fine)
  pnpm run test:integration    # seconds
  ```
  `dev:server-only` keeps `NODE_ENV=development`, which disables the OTP rate limit the suite depends on.
- Playwright E2E (`test/end-to-end`) needs the client too:
  ```sh
  pnpm run dev &                           # :3000 client + :8080 API
  pnpm exec playwright install chromium
  pnpm exec playwright test --project=chromium   # ~3 min, 46 pass / 1 skipped
  ```
  Outside CI the config reuses an already-running `pnpm run dev`, otherwise it starts one. Login is scripted by reading the OTP from maildev.
- Tear down with `docker compose -f docker-compose.yml down`.

## Git hooks (`.husky`) and commits

- `commit-msg`: commitlint with `@commitlint/config-conventional` (`type(scope): subject`, e.g. `fix(redirect): ...`). Scope may be pascal, lower or camel case.
- `pre-commit`: `secrets-check.sh` (rejects staged AWS-key-looking strings) then lint-staged (`oxlint --fix` + `oxfmt --write` on staged js/ts files).
- `pre-push`: `pnpm run lint` and `commitlint --from origin/develop`, so the `origin/develop` ref must exist locally (`git fetch origin develop`).
