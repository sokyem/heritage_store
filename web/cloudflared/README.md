Cloudflare Tunnel setup for the Next.js app when the app is self-hosted on your own VM.

Do not use this folder for the Railway deployment path in this repo.

If the app is deployed on Railway, the correct production setup is:

1. Deploy the web app to Railway.
2. Add the custom domain in Railway for `awulak.com` and optionally `www.awulak.com`.
3. Point Cloudflare DNS at the Railway target shown in the Railway custom domain screen.
4. Set `NEXTAUTH_URL` in Railway to the final public URL.

Use the tunnel files in this folder only if you are running the app on your own server and exposing that server through Cloudflare Tunnel.

Self-hosted tunnel layout examples:

1. Root domain on the tunnel
   - awulak.com -> tunnel
   - www.awulak.com -> tunnel
   - Replace any existing Pages or unrelated CNAME records for those hosts

2. App subdomain on the tunnel
   - app.awulak.com -> tunnel
   - Keep awulak.com elsewhere if needed

Commands after login for the self-hosted tunnel path:

1. Create the tunnel
   cloudflared tunnel create awula-web

2. Route DNS to the tunnel
   cloudflared tunnel route dns awula-web awulak.com
   cloudflared tunnel route dns awula-web www.awulak.com

   Or, if using a subdomain:
   cloudflared tunnel route dns awula-web app.awulak.com

3. Copy the matching config template from this folder to /etc/cloudflared/config.yml

4. Start the Next.js app
   npm run build
   npm run start -- --hostname 127.0.0.1 --port 3000

5. Install and start the tunnel service
   sudo cloudflared service install
   sudo systemctl enable --now cloudflared

Application env note:

- Update `NEXTAUTH_URL` to the final public URL before using auth in production.
- If the root domain is used, set `NEXTAUTH_URL=https://awulak.com`.
- If the subdomain is used, set `NEXTAUTH_URL=https://app.awulak.com`.