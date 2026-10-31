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
- Shopkeepers register without email: `registerShopkeeper` creates a confirmed account on a synthetic address (`shopkeeperEmail`, from the shop code); sign-in resolves username / shop number → account email inside `signInShopkeeper` so addresses never reach the browser. Older email-registered shops keep email login and reset.
- A shop row is created by the `handle_new_shopkeeper` trigger from sign-up metadata; uniqueness is pre-checked with the `check_shop_registration` RPC.
- Two roles derived from data, not a roles table: a shop owner (`shops.owner_id`) uses /dashboard, a cardholder (`customers.user_id`) uses /portal; `resolveHome` routes after sign-in.
- RLS: shop owners see their shop, customers and SMS history (`owns_shop`); cardholders see only their own card row and their shop (`is_shop_customer`). `customers.user_id` can only be set by service-role code (trigger), so owners cannot grant portal access.
- Cardholders sign in with a synthetic email derived from the Smart Card number (`cardholderEmail`); accounts are created confirmed by the `registerCardholder` server function, and shopkeepers reset portal passwords via `resetCardholderPassword`.
- Card number and mobile are each globally unique on `customers` (1 card ↔ 1 mobile).
- Live updates use Realtime on `shops` and `customers`; portal alerts are in-app toasts + browser Notification while the page is open (no push service).
- `shops.status` (open/lunch/closed) is the source of truth; `is_open` is deprecated and kept in sync by trigger.
- Theme: `.dark` class on <html>, set before hydration by `THEME_BOOT_SCRIPT`; all colors are tokens with light and dark values in `src/styles.css`.
- Role palettes: shopkeeper screens use the root tokens; cardholder screens add the `.theme-card` class, which overrides the same tokens (light + dark). Open / available / collected use `success` tokens, never `primary`, so they stay green in every palette.
- New-password forms use `NewPasswordFields` (Show/Hide toggle + Confirm Password) and `checkNewPassword` from `src/lib/ration.ts`.
- SMS dispatch is simulated (progress animation + `sms_logs` row); no SMS provider is wired yet.
- The sticky top bar for /dashboard and /portal is the shared `AppHeader` component; change it once so both stay one row on phones.
