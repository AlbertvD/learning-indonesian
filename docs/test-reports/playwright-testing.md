# Playwright Testing Reference

## Test User Credentials

Used for Playwright MCP walkthroughs and visual reviews against the local dev server (`http://localhost:5173`).

| Field    | Value                  |
|----------|------------------------|
| Email    | testuser@duin.home     |
| Password | password123            |

> This is a non-admin test account. To test admin-only features (e.g. FlagButton), log in with the admin account instead.

## Dev Server

```bash
bun run dev   # starts at http://localhost:5173
```

## Admin account

The admin account is the main `albert@duin.home` account. Admin features (content flagging) are gated behind `profile.isAdmin === true`, which is set via `indonesian.user_roles`.
