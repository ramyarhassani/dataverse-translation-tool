import { defineConfig, type Plugin } from 'vite';
import { copyFileSync } from 'fs';
import { resolve } from 'path';

/** Remove crossorigin attributes from script/link tags (PPTB BrowserView compatibility) */
function removeCrossorigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '');
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
  },
  plugins: [
    removeCrossorigin(),
    {
      name: 'copy-package-json',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, 'package.json'),
          resolve(__dirname, 'dist', 'package.json'),
        );
      },
    },
  ],
});
