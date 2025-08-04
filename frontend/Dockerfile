# Frontend Dockerfile for Baton
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage with nginx
FROM nginx:alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create non-root user
RUN addgroup -g 1001 -S nginx-user
RUN adduser -S nginx-user -u 1001

# Set proper permissions
RUN chown -R nginx-user:nginx-user /usr/share/nginx/html
RUN chown -R nginx-user:nginx-user /var/cache/nginx
RUN chown -R nginx-user:nginx-user /var/log/nginx
RUN chown -R nginx-user:nginx-user /etc/nginx/conf.d
RUN touch /var/run/nginx.pid
RUN chown -R nginx-user:nginx-user /var/run/nginx.pid

USER nginx-user

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Start nginx
CMD ["dumb-init", "nginx", "-g", "daemon off;"]