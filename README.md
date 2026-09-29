# Firmo

Quotes, proformas and invoices from a voice note, a photo or a text on WhatsApp or Telegram —
his prices, our presentation. A Kete app.

- Context and rules: [`CLAUDE.md`](CLAUDE.md), [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
- Phases: [`docs/ROADMAP.md`](docs/ROADMAP.md) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Product decisions (French): [`docs/product/`](docs/product/README.md)

## Run it

```sh
cp .env.example .env        # then fill the values
# @kete-africa/* are read from GitHub Packages with a read:packages token:
env "npm_config_//npm.pkg.github.com/:_authToken=$KETE_PACKAGES_TOKEN" pnpm install
pnpm db:migrate test        # migrations on the Neon "test" branch
pnpm test                   # unit and integration tests
pnpm dev                    # http://localhost:3400
```
