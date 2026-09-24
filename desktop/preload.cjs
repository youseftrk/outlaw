/** Outlaw preload — minimal bridge; the app itself is the Next.js UI. */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("outlaw", {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
});
contextBridge.exposeInMainWorld("outlawDesktop", {
  platform: process.platform,
  versions: { electron: process.versions.electron, node: process.versions.node },
  isDesktop: true,
});
