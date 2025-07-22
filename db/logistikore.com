server {
    listen 80;
    server_name logistikore.com www.logistikore.com;

    location / {
        root /var/www/react;
        index index.html;
        try_files $uri /index.html;
    }
}
