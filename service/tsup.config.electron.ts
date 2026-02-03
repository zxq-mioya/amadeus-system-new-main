import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'build',
  target: 'es6',
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
  shims: true,
  dts: false,
  noExternal: [ /(.*)/ ]
})
