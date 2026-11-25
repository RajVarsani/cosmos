# cosmos: one Go toolchain + air image shared by every Go service. Source is bind-mounted
# read-only at /source; air builds into /tmp and restarts the binary on edits.
FROM golang:1.26-alpine
RUN apk add --no-cache git ca-certificates curl tzdata \
 && GOBIN=/usr/local/bin go install github.com/air-verse/air@v1.62.0 \
 && rm -rf /root/go /root/.cache
ENV GOTOOLCHAIN=auto
WORKDIR /source
CMD ["air", "-c", "/cosmos/air.toml"]
