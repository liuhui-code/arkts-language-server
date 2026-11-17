/** One hook owns resource teardown and fixture removal. A failed earlier hook
 * otherwise prevents Node20 from reaching later cleanup hooks. */
export function createTestResourceScope(t, remove) {
  const resources = []
  t.after(async () => {
    const failures = []
    for (const close of resources.splice(0).reverse()) {
      try { await close() } catch (error) { failures.push(error) }
    }
    try { await remove() } catch (error) { failures.push(error) }
    if (failures.length) {
      t.diagnostic(`resource cleanup failures: ${failures.map(error => String(error)).join("; ")}`)
      throw new AggregateError(failures, "test resource cleanup failed")
    }
  })
  return close => resources.push(close)
}
