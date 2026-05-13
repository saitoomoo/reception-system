# Stage 1: build Vite app
FROM --platform=linux/amd64 node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# These are baked into the JS bundle at build time.
# Pass them via --build-arg when building the image.
ARG VITE_API_URL
ARG VITE_VAPID_PUBLIC_KEY

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_VAPID_PUBLIC_KEY=${VITE_VAPID_PUBLIC_KEY}

RUN npm run build


# Stage 2: serve with nginx
FROM --platform=linux/amd64 nginx:1.27-alpine

# Replace default config with our SPA-aware config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the Vite build output
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
