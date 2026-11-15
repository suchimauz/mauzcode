## 1. Transport deadlines

- [ ] 1.1 Add optional `headerTimeoutMs` and `idleTimeoutMs` to `models.transport.fetch` (default `min(total, 300000)`, validated 1..600000) and pass them to `socksProxy.request`
- [ ] 1.2 Forward the new deadlines through `models.connections.resolve`
- [ ] 1.3 Raise the `models.transport.parseSSE` default idle limit to 300000 ms

## 2. Model stream budgets

- [ ] 2.1 Use a 1800000 ms total deadline in `models.inference.stream` and `models.inference.compact`

## 3. Verification

- [ ] 3.1 Extend `src/models/transport.test.ts`: proxied requests receive header/idle 300000 by default and never above the total
- [ ] 3.2 Run the models transport tests, validate changed functions and run one project typecheck
