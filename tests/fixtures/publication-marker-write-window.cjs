const fs = require("node:fs/promises")
const path = require("node:path")
const writeFile = fs.writeFile

// Exercise the native open-before-write interval without changing marker payloads,
// semantic results, cancellation, or the source authority being tested.
fs.writeFile = async function (file, data, ...options) {
  const directory = process.env.ARKTS_TEST_PUBLICATION_BARRIER
  if (!directory || typeof file !== "string" || path.dirname(file) !== directory
    || !["entered", "entered.pending"].includes(path.basename(file))) {
    return writeFile.call(this, file, data, ...options)
  }
  const handle = await fs.open(file, "w")
  try {
    await new Promise(resolve => setTimeout(resolve, 200))
    await handle.writeFile(data, ...options)
  } finally { await handle.close() }
  await writeFile(path.join(directory, "write-window-completed"), "true")
}
