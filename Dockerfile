# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies strictly
COPY package*.json ./
RUN npm ci

# Copy full source and build
COPY . .
RUN npm run build

# Serve stage using lightweight Nginx
FROM nginx:1.27-alpine

# Copy the built Vite application to Nginx's default public directory
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing + gzip compression + cache headers + security
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 80;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 256;

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;

        # Cache static assets with hashes
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    location = /health {
        access_log off;
        add_header Content-Type text/plain;
        return 200 'ok';
    }
}
EOF

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:80/health || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
