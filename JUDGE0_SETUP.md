# Judge0 Self-Hosted Setup Guide

This guide walks you through deploying a self-hosted Judge0 instance for multi-language code execution in Antigravity IDE.

## Why Self-Host Judge0?

WebContainers only support JavaScript/TypeScript. For Python, Go, Rust, and other languages, we route execution to Judge0 — a free, open-source code execution engine.

## Prerequisites

- A VPS (Oracle Cloud Free Tier works great)
- Docker and Docker Compose installed
- At least 2GB RAM, 1 CPU core

## Quick Start

### 1. SSH into your VPS

```bash
ssh ubuntu@your-vps-ip
```

### 2. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get install docker-compose-plugin -y
```

### 3. Create Judge0 directory

```bash
mkdir -p ~/judge0 && cd ~/judge0
```

### 4. Create `docker-compose.yml`

```yaml
version: "3.8"

services:
  judge0:
    image: judge0/judge0:latest
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SECRET_KEY=your-secret-key-here-change-this
      - POSTGRES_PASSWORD=judge0password
      - POSTGRES_DB=judge0
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15-alpine
    restart: always
    environment:
      - POSTGRES_PASSWORD=judge0password
      - POSTGRES_DB=judge0
    volumes:
      - judge0-pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - judge0-redisdata:/data

volumes:
  judge0-pgdata:
  judge0-redisdata:
```

### 5. Start Judge0

```bash
docker compose up -d
```

### 6. Wait for initialization

```bash
# Watch logs until you see "Judge0 is ready"
docker compose logs -f judge0
```

Press `Ctrl+C` when you see the ready message.

### 7. Test the API

```bash
curl http://localhost:8080/languages | head -20
```

You should see a JSON array of supported languages.

### 8. Configure Antigravity IDE

In your Vercel environment variables, add:

```
JUDGE0_API_URL=http://your-vps-ip:8080
```

**Important:** If your VPS has a firewall, open port 8080:

```bash
sudo ufw allow 8080/tcp
```

## Production Considerations

### HTTPS (Recommended)

For production, put Judge0 behind nginx with SSL:

```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

Create `/etc/nginx/sites-available/judge0`:

```nginx
server {
    listen 443 ssl;
    server_name judge0.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/judge0.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/judge0.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then:

```bash
sudo ln -s /etc/nginx/sites-available/judge0 /etc/nginx/sites-enabled/
sudo certbot --nginx -d judge0.yourdomain.com
sudo systemctl reload nginx
```

Update your Vercel env var:

```
JUDGE0_API_URL=https://judge0.yourdomain.com
```

### API Key Authentication (Optional)

To add authentication, generate a key and set it in Judge0:

```bash
# Generate a random key
openssl rand -hex 32
```

Add to your docker-compose.yml environment:

```yaml
environment:
  - API_AUTHENTICATED=true
  - API_KEY=your-generated-key
```

Set in Vercel:

```
JUDGE0_API_KEY=your-generated-key
```

## Troubleshooting

### Judge0 won't start

- Check you have enough memory: `free -h`
- Check Docker is running: `docker ps`
- Check logs: `docker compose logs judge0`

### Submissions timeout

- Increase `maxAttempts` in `judge0-client.ts` if your VPS is slow
- Check VPS CPU usage: `htop`
- Check if language runtimes are installed: `docker compose exec judge0 ls /box/languages`

### CORS errors

If accessing from Vercel, you may need to add CORS headers to Judge0. Set these environment variables:

```yaml
environment:
  - ADDITIONAL_ENVIRONMENT=allow-cors-origins=https://antigravity.vercel.app
```

## Supported Languages

Judge0 supports 40+ languages including:

| Language | ID | Runtime |
|----------|-----|---------|
| JavaScript | 102 | Node.js 18 |
| TypeScript | 101 | TypeScript 5 |
| Python | 100 | Python 3.11 |
| Go | 107 | Go 1.21 |
| Rust | 108 | Rust 1.65 |
| Java | 104 | Java 17 |
| C | 105 | GCC 12 |
| C++ | 106 | GCC 12 |
| Ruby | 109 | Ruby 3.2 |
| PHP | 110 | PHP 8.2 |
| Swift | 111 | Swift 5.3 |
| Kotlin | 112 | Kotlin 1.8 |
| C# | 113 | .NET 7 |
| Scala | 114 | Scala 3 |
| R | 115 | R 4.3 |
| Dart | 116 | Dart 3.0 |

## Cost

- **Oracle Cloud Free Tier**: 4 ARM cores, 24GB RAM — plenty for Judge0
- **Google Cloud Free Tier**: e2-micro instance — may be tight
- **Hetzner**: ~$5/month for a capable VPS

## Next Steps

Once Judge0 is running, the Antigravity IDE will automatically route non-JS/TS files to your instance for execution.
