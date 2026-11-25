# Tasks

## 1. Declaration and configuration

- [ ] 1.1 Create `src/voice/$voiceProvider_deepgram.ts` with id, label, cloud destination, `destinationFor`, transports `direct`/`socks`/`ssh-tunnel`, fields (apiKey, baseUrl, languages, keyterms, smartFormat default true, mipOptOut default false) and the static `nova-3` model (client turns, `sampleRates: [16000]`, languages, keywords). Verify by loading it with `procs.repl.load` and checking that `providers.test.ts` and `selfContained.test.ts` pass with the provider listed.
- [ ] 1.2 Implement `validateConfig` and the start-time option checks (HTTPS Base URL, language tags, keyterm line breaks and limits). Verify with unit tests in `src/voice/deepgram.unit.test.ts` for the `httpsEndpoint`, `languageList` and `keywordList` reasons (including "Too many keyterms") and for the absence of network calls.
- [ ] 1.3 Implement pure query building (language/multi/hints, smart_format with no_delay, mip_opt_out, keyterm, fixed audio parameters) and verify with unit tests for the spec scenarios "Default connection", "Smart formatting turned off", "Opt-out and keyterms", "One language" and "Several languages".

## 2. Live stream

- [ ] 2.1 Build the Deepgram fake upstream `src/voice/contract/deepgramFake.entry.ts` (records headers, query, binary/text frames; scripts Results/Metadata/Error/close) and the conformance driver `deepgramDriver.entry.ts`. Verify that the fake runs in the integration test harness.
- [ ] 2.2 Implement `open`: routed socket, token header, ready after upgrade, 50 ms binary re-framing with remainder flush and no empty frames, `Finalize` per commit, time-based result attribution, revisions and one final, ordered settlement with the `from_finalize`, coverage and 2 s quiet-timer rules, and an empty commit settling without `Finalize`. Verify with `src/voice/deepgram.it.test.ts` ("Browser chunks of another size", two phrases, several segments, Finalize without an answer, straddling results) and with `runVoiceProviderContract` for `deepgram` passing.
- [ ] 2.3 Implement KeepAlive timing, `CloseStream` on finish with a bounded wait, usage from `Metadata.duration`, immediate cancel and abort cleanup. Verify with integration tests for "Paused capture", "Finish reports usage" and for cancel leaving no open socket.
- [ ] 2.4 Implement classified failures (upgrade 401/403/429/other, socketClosed with code, serviceError, malformedMessage) with fixed sanitized messages. Verify with integration tests for "Rejected key at start" and "Stream closed for bad audio" that assert no key, reason text or frame content leaks.

## 3. Connection test and routing

- [ ] 3.1 Implement `test` (open, `CloseStream`, wait for close, map to available/bad-key/timeout/unreachable). Verify with integration tests "Test a valid connection" (no binary frame) and "Test a rejected key".
- [ ] 3.2 Add Deepgram cases to `src/voice/transport.it.test.ts` or a dedicated routed test: test and live session over SOCKS5 and SSH tunnel to the local TLS fixture, and an unavailable route failing without a direct retry. Verify that the tests pass.

## 4. Documentation and integration check

- [ ] 4.1 Update `docs/voice-providers.md`: implementation status, a "Set up Deepgram" section (API key, Base URL/EU endpoint, languages and multi, keyterms and usage-log visibility, smart formatting, MIP opt-out cost, test behaviour, routes) and the "What stays local" notes. Verify that the documented settings match the declared fields.
- [ ] 4.2 Run `bun test src/voice` and the project typecheck once for the settled batch, and verify that both are clean apart from separately recorded pre-existing failures.
- [ ] 4.3 Manually dictate one Russian and one mixed ru/en phrase through a real Deepgram key in a chat and verify that the phrases appear in order in the draft and that Settings → Voice shows the test as available.
