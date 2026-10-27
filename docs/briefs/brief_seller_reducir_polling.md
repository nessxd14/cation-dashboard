# Brief — Seller: cut background polling to bring Supabase log ingestion under the free quota

**Repo:** `nessxd14/seller` · **Base branch:** `main` (last seen at `94a8909`, merge of PR #111) · **New branch:** `perf/reducir-polling`
**Do not open a second PR if one already exists for this branch.**
**No database migration is required. Frontend only.**

## Why

Supabase log ingestion is at 2.25 GB this cycle against a 1 GB free quota. Over 85% of it is `edge_logs`: one log entry per API request. On 2026-10-12, a single cashier session made the following requests between 09:07 and 11:50:

| Request | Calls | Effective rate |
| --- | --- | --- |
| `GET /rest/v1/sesion_caja` | 1,100 | every ~9 s |
| `GET /rest/v1/perfil` | 1,087 | every ~9 s |
| `POST /rest/v1/rpc/pedidos_vendedor_cola` | 954 | every ~10 s |

That is about 20 requests per minute per open cashier tab, mostly while nothing is happening. **Target: an idle cashier tab makes ≤ 3 requests per minute.**

Also important: the `supabase_realtime` publication currently has **no tables**. The `postgres_changes` channels in `useCashRefresh` never fire. All freshness today comes from polling.

## Changes

### 1. Cache the profile in `SupabaseAuthSessionProvider`
File: `src/infrastructure/supabase/SupabaseAuthSessionProvider.ts`

`getSession()` calls `resolveSession(userId)` every time, and that runs `supabase.from('perfil').select(...)`. Many components and contexts call `getSession()`, including `CashSessionContext` on every tick.

- Add a module-level cache: `{ userId, session, fetchedAt }` with a 5-minute TTL.
- Add an in-flight promise so concurrent callers share one request.
- `getSession()` still reads `supabase.auth.getSession()`, which is local and makes no network call. It returns the cached resolved session when the `userId` matches and the entry is fresh. Otherwise it calls `resolveSession`.
- Invalidate the cache inside the existing `onAuthStateChange` handler on `SIGNED_OUT`, `SIGNED_IN` and `USER_UPDATED`.
- On `TOKEN_REFRESHED` and `INITIAL_SESSION`, reuse the cache when the user is unchanged.
- Keep the current behaviour for a missing `perfil` row (`hasProfile: false`). Do not cache errors.
- Export a `invalidarSesionCache()` helper for tests.

### 2. Slow the cash-session poll and stop it in hidden tabs
File: `src/context/CashSessionContext.tsx`, effect inside `CashSessionProvider`.

- Change `window.setInterval(update, 15_000)` to **60_000**.
- In the interval callback, skip when `document.visibilityState === 'hidden'`.
- Add a `visibilitychange` listener that calls `update` when the tab becomes visible. Keep the existing `focus` listener and auth subscription.
- `refresh()` is already called by `CashPage` after opening or closing a shift, so the cashier's own actions still update at once.

### 3. Slow the cash screen refresh
File: `src/features/cash/useCashRefresh.ts`

- Change `window.setInterval(update, 15_000)` to **60_000**. The hidden-tab guard is already there; keep it.
- Leave the Realtime channel code as is. It is harmless and will work if Realtime is enabled later.
- Add a short comment that the publication is empty today, so polling is the only source of freshness.

### 4. Vendor-order queue: slower poll, refresh on focus
- `src/features/caja-pedidos/PedidoVendedorCobro.tsx`: change `COLA_REFRESH_MS` from `5000` to **20_000**. In the `paso === 'cola'` effect, also call `cargarCola()` on window `focus` and on `visibilitychange` to visible. Remove both listeners on cleanup.
- `src/pages/PosPage.tsx`: in the effect that counts `enEspera` via `pedidoVendedorService.cola()`, change `10_000` to **30_000**. Add the same focus and visible refresh. Keep the existing `document.visibilityState !== 'visible'` guard.

### 5. Stop the ticket status poll once it is settled
File: `src/components/CajaTicket.tsx`

- The 5-second `check()` interval runs for as long as the ticket modal is open.
- Clear the interval as soon as `status` resolves to anything other than `'pending'`.
- Also stop after 3 minutes no matter what.
- Skip ticks when the tab is hidden.

### 6. Minor
`src/components/SaldoBadge.tsx` (15 s) and `src/hooks/useSaldoCliente.ts` (30 s) already skip hidden tabs. Leave them unchanged.

## Out of scope

- Enabling Realtime (adding tables to `supabase_realtime`). That needs its own decision and migration.
- Almacén (`almacen_cation`) and Conciliador.
- Any change to what the screens show. This is a request-volume change only.

## Tests and acceptance

1. Update or add unit tests with fake timers:
   - `getSession()` called 5 times within 5 minutes makes exactly one `perfil` query.
   - It makes a fresh query after `SIGNED_OUT` followed by `SIGNED_IN`.
   - `CashSessionProvider` does not call `getSesionAbierta` while `document.visibilityState` is `'hidden'`.
   - The `PedidoVendedorCobro` queue polls at 20 s.
   - `CajaTicket` stops polling after the status becomes `'ready'`.
2. Run `npm run test` (vitest) and `npm run build`. Both must pass.
3. **Manual check** in DevTools, Network tab filtered by `supabase.co`:
   - Leave the cashier POS (Venta module, open shift) idle and visible for 5 minutes. Expect ≤ 15 requests in total. Today it is ~100.
   - Hide the tab for 2 minutes. Expect 0 requests.
4. In the PR description, report the before and after request counts from step 3.

After merging, confirm the production deployment on Vercel (`target: production` on the new commit). Auto-promotion has failed before; promote by hand if needed.
