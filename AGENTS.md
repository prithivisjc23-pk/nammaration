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
- Shopkeeper sign-in resolves username / shop number → email inside the `signInShopkeeper` server function so emails are never exposed to the browser.
- A shop row is created by the `handle_new_shopkeeper` trigger from sign-up metadata; uniqueness is pre-checked with the `check_shop_registration` RPC.
- Shop, customer and SMS history access is owner-only through RLS (`owns_shop`); the browser client talks to tables directly.
- SMS dispatch is simulated (progress animation + `sms_logs` row); no SMS provider is wired yet.
