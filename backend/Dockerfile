# Stage 1: build server binary and migrate CLI
FROM --platform=linux/amd64 golang:1.25-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

# Download dependencies first for layer caching
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Server binary — pure Go, no CGO required
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /app/server \
    ./cmd/server

# migrate CLI with postgres driver (lib/pq is in go.sum)
RUN CGO_ENABLED=0 GOOS=linux go build \
    -tags 'postgres' \
    -trimpath \
    -ldflags="-s -w" \
    -o /app/migrate \
    github.com/golang-migrate/migrate/v4/cmd/migrate

# Seed CLI for one-off data seeding (e.g. global admin creation)
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /app/seed \
    ./cmd/seed


# Stage 2: minimal runtime image
FROM --platform=linux/amd64 alpine:3.21

# ca-certificates is needed for TLS connections to Neon and push services
RUN apk add --no-cache ca-certificates tzdata

# Non-root user (UID 1001)
RUN addgroup -g 1001 app && \
    adduser -u 1001 -G app -h /home/app -s /sbin/nologin -D app

COPY --from=builder /app/server   /app/server
COPY --from=builder /app/migrate  /app/migrate
COPY --from=builder /app/seed     /app/seed
COPY migrations/                  /migrations/
COPY entrypoint.sh                /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

USER 1001

ENTRYPOINT ["/entrypoint.sh"]
