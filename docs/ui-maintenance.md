# UI implementation and compatibility maintenance

Read [UI architecture](ui-architecture.md), [design system](ui-design-system.md) and [live updates](live-updates.md) before changing MauzCode surfaces. For **MauzCode's own UI**, also read `docs/skills/apple-design/SKILL.md` and its `README.md`: pinned, MIT-licensed, on-demand guidance. Respect the user's request, existing light/dark tokens, hierarchy, restraint, immediate feedback, usable targets, keyboard focus, accessibility and reduced motion. This product-scoped preference is not inherited by other projects or global agent settings.

## Primary React extension contract

The primary shell is React/Vite (`frontend/src/LiveApp.tsx`) at `/`. `/old-ui` redirects supported GET/HEAD entry links; it is not another application. New trusted extensions use the public `@mauzcode/ui` local Vite alias (`frontend/src/sdk/index.ts`), not a published package, private/deep imports or a second React runtime. Read the SDK and `frontend/src/extensions/{types,registry,installed,pluginRuntime}.ts`, `ExtensionHost.tsx`, and test fixture `frontend/src/test/fixtures/sdk-example.tsx` before extending them.

- Built-in screens live in `frontend/src/core-ui/`. Plugin UI lives **only** in `<plugin>/ui/index.tsx`, default export with id equal to the plugin name, and grants in `package.json procs.ui`. No plugin-specific frontend edits/rebuilds or `frontend/src/ui-plugins` directory: the host builds/loads bundles at runtime via `/plugins/ui/manifest`.
- Import host React, public SDK and the plugin's declared package dependencies only; no remote modules/private host components. Dependencies are included in the approved hash; host React/React DOM are deduplicated.
- Extensions declare `apiVersion: 1`, pages/navigation/panels/actions/Canvas kinds/Canvas launchers. Core grants are in `extensions/installed.ts`; plugin grants are `procs.ui`. Official plugins are pre-approved; others require a person's approval of the exact bundle hash and grants in Plugins.
- The host owns layout and supplies `agentId`, resolved `theme` and `readOnly`. Mark mutating actions `mutates`. Extensions are **trusted same-origin code, not a sandbox**: frontend grants/disabled controls never substitute for backend auth, ownership, CSRF or explicit human approvals.
- Use SDK components and `requestJson`; writes need the supported cookie-bound CSRF token option/header or meta fallback. Handle 401/403 and failures; no invented token endpoints or automatic write retries.
- `subscribeLive` / `useLiveSubscription` require `resync`, `onError`, cleanup and narrow `data-live-topic` declarations. Events invalidate state; canonical authorized HTTP reads restore it after gaps.

## Preserve residual consumers

The old `ui.layout` navigation/dock/chat shell is removed, but `procs.http.toResponse` still dynamically selects `registry.ui.layout` as a minimal standalone document renderer. HTTP strings and `{ main, title }` are wrapped; `Response` passes through. React Applications still exposes necessary declared built-in/plugin HTML documents. **Do not equate shell removal with all SSR removal** or delete shared renderers/approvals; use the residual consumer map in `ui-architecture.md`.

People and sidebar drafts are authorized React JSON surfaces. SSH settings opens the native `llm-connections` tab through a callback, not `/llms`. The SDK example is absent from production and remains only in the test registry/fixture. Canvas has native file editing/directory browsing, granted React `canvasKinds` and `canvasLaunchers`; Terminal is the official `plugins/terminal` launcher, not core. Item documents (`kind.render`/assets) remain for other previews/plugin kinds. Preserve `input.compatView` secure transports and **Redmine's separate confirmation authority**.

To show a file beside chat, use `canvas.show({ kind: 'file', args: { path } })`, not whole-page navigation. Transcript tool cards age from open to one line to tray; errors retain red tint but tuck too. Only a human click pins a card.

## Compatibility scripts, screen and tours

HTMX, `#main`, `$script_*` and SSR data markers are compatibility mechanisms, **not the React extension API**. Primary React does not load `/ui/control.js`; minimal SSR does. `ui.action`/`ui.eval` returning `dispatched:true` only proves emission, not a compatible consumer or execution. An event subscriber alone proves neither. Server-side `ui.createAgent`/`sendToAgent` effects are distinct from their best-effort navigation.

`screen.eval` depends on the screen client's `window.page`, sends code over SSE and waits for `POST /screen/result`; even plain DOM code can time out without the bridge. `screen.openTab` first needs screen.eval to obtain the origin before CDP. For real browser automation, discover the browser plugin and prerequisites, rather than assume a browser exists in-process.

Existing `screen.*` verbs include `open` (partial #main navigation), `click`, `fill`, `submit`, `point`, `say`, `readScreen`, `text`, and `where` (last beacon without a round trip). Compatibility targets use `procs.ui.attr` data markers (page/entity/id/form/action/role), not arbitrary CSS selectors. Existing menu/chat/agent-picker/search/agent-passport markers are not promises that the React shell exposes those targets. `tour.play` provides a scripted walk, `tour.review` checks steps without a browser, and `screen.step` is a live step; human presses travel via `screen.press` and `agent/$hook_screen.press.ts` into the current agent queue. Preserve the `ctx.state.procs.styles` link for pointer/tour framework CSS.

`$script_*.js` assets are bundled by `procs/http/$loader_script.ts`, not functions. Reload with `procs.http.loadRoutes({})` or `procs.dev.sync` and verify the served HTTP output, including overlay overrides. Browser code never listens directly to `mauzcode-events`: SSR fragments use `ui.live`; other mirrors use `window.mauzcodeLive.subscribe({ types, onEvent, resync })`, with required resync after stream gaps. One-shot instructions use the compatibility live command API; see `docs/live-updates.md` for exact spelling/contracts. The `live-subscribe` quality rule enforces subscriptions.

Keep existing native controls, `ui.live`, delegated handlers and popup RPC working without expanding them into a primary frontend policy. `hx-popup` / `hx-popup-params` own shared popup requests/swaps; do not mix manual fetch or competing HTMX triggers into them. Avoid inherited navigation attributes around self-refreshing descendants. Preserve auth, CSRF, explicit approval, themes, accessible labels/focus and SSE resync during migration.
