/** Qalaa preload — minimal bridge; the app itself is the Next.js UI. */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("qalaa", {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
});
contextBridge.exposeInMainWorld("qalaaDesktop", {
  platform: process.platform,
  versions: { electron: process.versions.electron, node: process.versions.node },
  isDesktop: true,
});
