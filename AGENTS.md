<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- Pure business rules (validation, SMS lock, message text, search, counters) live in `src/lib/ration.ts` with tests in `src/lib/ration.test.ts`; UI imports them so rules stay testable.
- All UI text goes through `src/lib/i18n.ts` (en + ta) via `useLang()`; never hardcode user-facing strings in one language.
- Shop accounts are provisioned by authenticated Super Admin server functions, never public registration; sign-in and owner RLS require active shop rows rather than a static ID allowlist so dynamic shops share the same security boundary.
- Shop lifecycle metadata never creates shop rows; trusted provisioning links each preloaded row to its confirmed auth account to prevent self-granted shop access.
- Shopkeeper login verifies server-only hashed shop-table credentials with a throttled RPC, then exchanges an admin-generated one-time token for an owner session; browser shop reads explicitly exclude credential columns to preserve RLS without exposing hashes.
- Super Admin and shopkeeper role assignments live in protected `user_roles`; admin server functions verify roles through the caller-scoped client before privileged work. Cardholder identity remains mapped by `customers.user_id`; `resolveHome` sends admins to /manage-shops, owners to /dashboard, cardholders to /portal.
- RLS: shop owners see their shop, customers and SMS history (`owns_shop`); cardholders see only their own card row and their shop (`is_shop_customer`). `customers.user_id` can only be set by service-role code (trigger), so owners cannot grant portal access.
- Cardholders sign in with a synthetic email derived from the Smart Card number (`cardholderEmail`); accounts are created confirmed by the `registerCardholder` server function, and shopkeepers reset portal passwords via `resetCardholderPassword`.
- Card number and mobile are each globally unique on `customers` (1 card ↔ 1 mobile).
- Collection writes use authenticated RPCs and an immutable monthly ledger with unique card/month and mobile/month constraints; row locks serialize concurrent branch distribution, and browser writes cannot change eligibility or identity.
- Exact cross-shop lookup returns central eligibility, family head, family members and quota only to active shop owners; full registries and unrelated contact/account details remain owner-scoped. Central ledger transactions enforce lockout immediately; checked foreign cards refresh every two seconds and on focus.
- Monthly eligibility uses the Asia/Kolkata calendar and dated records, not destructive resets, so previous collection history remains auditable.
- Live updates use Realtime on `shops` and `customers`; portal alerts are in-app toasts + browser Notification while the page is open (no push service).
- `shops.status` (open/lunch/closed) is the source of truth; `is_open` is deprecated and kept in sync by trigger.
- Theme: `.dark` class on <html>, set before hydration by `THEME_BOOT_SCRIPT`; all colors are tokens with light and dark values in `src/styles.css`.
- Sign-in screens (`AuthShell`) use the neutral `.theme-auth` palette for both roles, with no elephant branding; shopkeeper and cardholder are independent panels (side by side from md, a top toggle on phones).
- Role palettes: shopkeeper screens use the root tokens; cardholder screens add the `.theme-card` class, which overrides the same tokens (light + dark). Open / available / collected use `success` tokens, never `primary`, so they stay green in every palette.
- New-password forms use `NewPasswordFields` (Show/Hide toggle + Confirm Password) and `checkNewPassword` from `src/lib/ration.ts`.
- SMS dispatch is simulated (progress animation + `sms_logs` row); no SMS provider is wired yet.
- The sticky top bar for /dashboard and /portal is the shared `AppHeader` component; change it once so both stay one row on phones.
- Home-screen install is manifest-only (`public/manifest.webmanifest`, icons in `public/icons/`, Apple meta tags in `__root.tsx`); no service worker, since offline use was not requested and workers cache stale builds in preview.
