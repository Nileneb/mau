Deploy helpers — systemd example services
========================================

Overview
--------
This folder contains optional systemd helper files to periodically rebuild the docker-compose stack and warm the in-memory GitHub cache of the `mau` app. They're provided as an example; you can copy/adjust them to your target host.

Files
-----
- `rebuild-mau.sh` — Script invoked by `rebuild-mau.service`; simple `docker compose pull && docker compose up -d --build`.
- `rebuild-mau.service` / `rebuild-mau.timer` — systemd unit + timer to rebuild the app once a day.
- `warm-cache.sh` — Script that requests the app's `/api/github?repo=` endpoints. Lightweight and useful to keep in-memory caches warm.
- `warm-cache.service` / `warm-cache.timer` — systemd unit + timer to run `warm-cache.sh` once every hour.

Docker usage
------------
If you prefer to keep the warm-cache job inside the compose stack (no host-level systemd), we've added a `warm-cache` service in `docker-compose.yml` which continuously runs the warm script and sleeps for an hour between runs. This can be enabled by default when you run `docker compose up -d`.

How to enable on a Linux host with systemd
------------------------------------------
Copy the service/timer files to `/etc/systemd/system/`, then enable and start the timers:

```bash
sudo cp deploy/*.service deploy/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now warm-cache.timer
sudo systemctl enable --now rebuild-mau.timer
```

Security and notes
------------------
- The `rebuild` job restarts your docker-compose stack. For most use-cases you don't need to rebuild daily. Smaller, more efficient setups use the warm-cache job to pre-populate the in-memory GitHub cache.
- If running as a non-root user, adjust `User=` in the service files and make sure the user has permission to run `docker compose`.
- If your app is behind a reverse proxy and listens on another port, update `warm-cache.sh` host variable accordingly.
