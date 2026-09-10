# ecommerce.oduor-arnold.com → Next.js container (127.0.0.1:3080)
# Certbot will add listen 443 / ssl_* lines on first issuance.

server {
    listen 80;
    server_name ecommerce.oduor-arnold.com;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
