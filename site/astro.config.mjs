import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 本番ドメイン。sitemap/canonical の基準になる。
export default defineConfig({
  site: 'https://oretachi.me',
  integrations: [sitemap()],
});
