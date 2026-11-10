// Bundles src/plugin.jsx into ../desktop/plugin.js: one ESM file whose only imports are the three
// specifiers Hermes Desktop resolves.
import { build } from 'esbuild'
import { readFileSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = join(root, '..', 'desktop', 'plugin.js')
const staging = `${outfile}.tmp`
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

await build({
  entryPoints: [join(root, 'src', 'plugin.jsx')],
  outfile: staging,
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  target: 'es2022',
  external: ['react', 'react/jsx-runtime', '@hermes/plugin-sdk'],
  banner: { js: `// Hermes Plant ${version}, built from desktop-src/ (npm ci && npm run build). Do not edit.` },
  logLevel: 'warning'
})
// Rename into place so a watching Desktop never reads a half-written file.
renameSync(staging, outfile)
console.log(`wrote ${outfile} (${(statSync(outfile).size / 1024).toFixed(0)} KiB)`)
