# openssl for test fixtures that mint throwaway TLS certificates (test/tls/certs.ts).
# Built once per checkout and reused; the host needs Docker, not openssl.
FROM alpine:3.20
RUN apk add --no-cache openssl
ENTRYPOINT ["openssl"]
