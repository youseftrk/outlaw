/** Outlaw preload — minimal bridge; the app itself is the Next.js UI. */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("outlawDesktop", {
  platform: process.platform,
  versions: { electron: process.versions.electron, node: process.versions.node },
  isDesktop: true,
});
