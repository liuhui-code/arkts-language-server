const fs = require("node:fs")
const path = require("node:path")
const cp = require("node:child_process")
const { promisify } = require("node:util")
const { syncBuiltinESMExports } = require("node:module")

// Delay only an actual OS read, never its process/RSS data or either clock.
const control = process.env.ARKTS_TEST_RSS_BOUNDARY_CONTROL
if (control && path.basename(process.argv[1] ?? "") === "sample-process-tree-rss.mjs") {
  const started = path.join(control, "sample-started.json")
  const ready = path.join(control, "post-window-child.json")
  async function crossBoundary() {
    fs.writeFileSync(started, JSON.stringify({ timestamp: Date.now() }))
    const deadline = performance.now() + 5_000
    while (!fs.existsSync(ready)) {
      if (performance.now() >= deadline) throw new Error("RSS_BOUNDARY_CHILD_NOT_READY")
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  if (process.platform === "darwin") {
    const original = cp.execFile
    let reads = 0
    cp.execFile = function (command, args, options, callback) {
      if (command !== "/bin/ps" || ++reads !== 2) {
        return original.call(this, command, args, options, callback)
      }
      void crossBoundary().then(
        () => original.call(this, command, args, options, callback),
        error => callback(error, "", ""),
      )
    }
    cp.execFile[promisify.custom] = (...args) => new Promise((resolve, reject) => {
      cp.execFile(...args, (error, stdout, stderr) => {
        if (error) reject(Object.assign(error, { stdout, stderr }))
        else resolve({ stdout, stderr })
      })
    })
  } else if (process.platform === "linux") {
    const original = fs.promises.readFile
    let held = false
    fs.promises.readFile = async function (file, ...args) {
      if (!held && String(file).endsWith("/uptime")) {
        held = true
        await crossBoundary()
      }
      return original.call(this, file, ...args)
    }
  }
  syncBuiltinESMExports()
}
