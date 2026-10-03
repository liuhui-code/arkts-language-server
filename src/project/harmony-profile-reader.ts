import fs from "node:fs"
import JSON5 from "json5"
import type { LoadedConfigurationWitness } from "./loaded-configuration-witness.js"

/*! @license JSON5 2.2.3
MIT License

Copyright (c) 2012-2018 Aseem Kishore, and [others].

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

[others]: https://github.com/json5/json5/contributors
*/

const MAX_PROFILE_BYTES = 64 * 1024

export function readHarmonyProfile(
  filePath: string,
  witness?: LoadedConfigurationWitness,
): Record<string, unknown> | null | undefined {
  if (witness) return witness.observe(filePath, () => readHarmonyProfile(filePath))
  let descriptor: number | undefined
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile() || stat.size > MAX_PROFILE_BYTES) return null
    const buffer = Buffer.alloc(MAX_PROFILE_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const count = fs.readSync(descriptor, buffer, length, buffer.length - length, null)
      if (count === 0) break
      length += count
    }
    if (length > MAX_PROFILE_BYTES) return null
    const value: unknown = JSON5.parse(buffer.toString("utf8", 0, length))
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : null
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? undefined : null
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}
