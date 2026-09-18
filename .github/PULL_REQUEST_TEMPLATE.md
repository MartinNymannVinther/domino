## What this changes

<!-- One or two sentences. The why matters more than the what. -->

## Checklist

- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass
- [ ] New tables ship with `org_id`, forced RLS, an audit trigger and an isolation test
- [ ] No user-facing string is hardcoded; `messages/da.json` and `messages/en.json` are both updated
- [ ] No file grew past roughly 300 lines
- [ ] A decision worth remembering has an ADR in `docs/adr/`
