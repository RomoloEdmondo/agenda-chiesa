# agenda-chiesa

Interfaccia dell’agenda della Christliche Gemeinde Ruchheim per GitHub Pages. Il calendario e gli account sono gestiti dall’API Cloudflare Workers con D1.

1. Pubblica l’API dal pacchetto Cloudflare e imposta `FRONTEND_ORIGIN` su `https://romoloedmondo.github.io`.
2. In **Settings → Secrets and variables → Actions → Variables**, crea `CLOUDFLARE_API_URL` con l’origine HTTPS del Worker.
3. In **Settings → Pages**, scegli **GitHub Actions** come fonte. Avvia quindi **Pubblica l’agenda** dalla scheda **Actions**.

Per compilare localmente, esegui `npm run build`. Per collegare l’API, imposta la variabile d’ambiente `API_BASE` prima della compilazione.
