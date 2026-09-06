import { defineConfig } from 'astro/config';
import { site, isPreview } from './src/lib/settings.mjs';

export default defineConfig({
  site: site.origin,
  base: site.base,
  output: 'static',
  outDir: isPreview() ? './dist-preview' : './dist',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
