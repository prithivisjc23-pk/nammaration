# Namma Ration roadmap

## Done — migration
- [x] Database: shops, customers, SMS history with owner-only access
- [x] Shopkeeper sign-in / register shop + password reset
- [x] Shopkeeper dashboard (controls, stock, SMS, customers, month reset, Tamil/English)
- [x] Favicons, page titles, business-rule tests, end-to-end check

## Dual-role system (brief uploaded 28 Oct)
- [x] Shopkeeper registration: shop name, area, mobile, unique shop code (e.g. FPS-104)
- [x] Shop status Open / Lunch Break / Closed (replaces open/closed switch)
- [x] Shop timing editor (morning + evening hours)
- [x] Customer portal: registration (card, mobile, name, district, shop code dropdown), sign-in
- [x] One smart card = one mobile, registered once
- [x] Customer dashboard: live status banner, timings, stock grid, own collection status — live updates
- [x] Customer alerts on open / status / stock changes (while portal is open; full push needs Firebase later)
- [x] Dark / light theme toggle
- [x] Tamil / English on all new screens
- [x] Tests for new rules + end-to-end check

## Layout cleanup (28 Oct)
- [x] Remove Shop Timings editor from shopkeeper dashboard
- [x] Dashboard fits one screen on desktop (3-column grid)
- [x] Cardholder phone view: one-row top bar, tighter spacing, safe bottom padding

## Theme + login polish (31 Oct)
- [x] Crimson #8B0000 headers / primary, gold #FFD700 accents and active tabs, elephant badge + watermark
- [x] Role selector: Card Holder (green/blue portal) vs Shopkeeper (red/gold dashboard)
- [x] Show/Hide password toggle, Confirm Password check on sign-up and reset

## Login redesign (1 Nov)
- [x] Neutral light sign-in page, no red wash or elephant watermarks; crimson buttons, gold active indicators
- [x] Desktop: Shopkeeper panel left, Card Holder panel right; phones: top toggle

## Phone home-screen app (2 Nov)
- [x] Manifest + icons + iOS/Android meta: opens full-screen without browser bars

## Waiting on user
- [ ] Existing shopkeeper data import (old data lives only in each shopkeeper's browser)

## Whitelisted shops and monthly distribution
- [ ] Repair shop-table password verification, activate owner accounts, and verify all three real dashboard logins
- [ ] Preload three Tirunelveli shops and restrict shopkeeper access
- [ ] District-based customer mapping to active shops
- [ ] Atomic monthly collection ledger and cross-branch duplicate warnings
- [ ] Verify signup, collection, cross-shop lookup and access restrictions
