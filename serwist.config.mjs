/** @type {import("@serwist/cli").BuildOptions} */
const config = {
  globDirectory: "out",
  globPatterns: ["**/*.{html,js,mjs,css,woff,woff2,png,svg,ico,webmanifest,json,txt}"],
  globIgnores: ["sw.js", "sw.js.map", "**/*.epub", "**/*.pdf", "**/*.cbz"],
  modifyURLPrefix: { "": "/" },
  dontCacheBustURLsMatching: /^\/_next\/static\//,
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  swSrc: "./src/app/sw.ts",
  swDest: "out/sw.js",
};

export default config;
