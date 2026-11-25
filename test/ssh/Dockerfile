# Disposable sshd for remote.* tests. Two flavours from one file:
#   default          — bash, tmux, rsync, git, coreutils; NO ripgrep (exercises the grep/find fallbacks)
#   openssh-client   — the image also serves as the LOCAL rsync client (test/ssh/fixture.ts), so the
#                      host needs no rsync of its own
#   --build-arg RG=1 — same plus ripgrep (exercises the rg paths)
#   --build-arg PYTHON=1 — Python 3 for descriptor-bound workspace skill reads
FROM alpine:3.20
ARG RG=0
RUN apk add --no-cache openssh-server openssh-client su-exec bash tmux rsync coreutils procps findutils grep git \
 && if [ "$RG" = "1" ]; then apk add --no-cache ripgrep; fi \
 && adduser -D -s /bin/bash tester && passwd -u tester >/dev/null 2>&1 || true \
 && mkdir -p /home/tester/.ssh && chmod 700 /home/tester/.ssh \
 && ssh-keygen -A \
 && sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?AllowTcpForwarding.*/AllowTcpForwarding no/' /etc/ssh/sshd_config \
 && echo 'MaxSessions 64' >> /etc/ssh/sshd_config \
 && echo 'MaxStartups 64:30:128' >> /etc/ssh/sshd_config
ARG PYTHON=0
RUN if [ "$PYTHON" = "1" ]; then apk add --no-cache python3; fi
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
