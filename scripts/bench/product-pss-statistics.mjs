import { isDeepStrictEqual } from "node:util"

const recipe = {
  server: { steadyPssBytes: "median", peakPssBytes: "maximum", pss10kBytes: "median",
    pss100kBytes: "median", initialWarmPssBytes: "first", postEvictionPssBytes: "median" },
  deveco: { steadyPssBytes: "median", peakPssBytes: "maximum" },
}

/** Arithmetic binding only: sample windows and product coverage remain independent. */
export function productPssSummaryBinding(statistics, metricSamples, summaries) {
  if (statistics === undefined) return { summaryBinding: "NOT_VERIFIED" }
  if (!isDeepStrictEqual(statistics, { schemaVersion: 1, recipe: "product-pss-summary-v1" })) {
    return { summaryBinding: "FAIL", summaryError: "PRODUCT_MEMORY_STATISTICS_RECIPE_INVALID" }
  }
  const values = { server: {}, deveco: {} }, missingSummaryMetrics = []
  for (const [product, metrics] of Object.entries(recipe)) {
    for (const [metric, reduction] of Object.entries(metrics)) {
      const samples = metricSamples[`${product}.${metric}`]
      if (!samples?.length) { missingSummaryMetrics.push(`${product}.${metric}`); continue }
      if (reduction === "first") values[product][metric] = samples[0]
      else {
        const sorted = [...samples].sort((left, right) => left - right)
        const middle = Math.floor(sorted.length / 2)
        if (reduction === "maximum") values[product][metric] = sorted.at(-1)
        else if (sorted.length % 2) values[product][metric] = sorted[middle]
        else {
          const sum = sorted[middle - 1] + sorted[middle]
          if (!Number.isSafeInteger(sum)) return {
            summaryBinding: "FAIL", summaryError: "PRODUCT_MEMORY_STATISTICS_ARITHMETIC_UNSAFE" }
          values[product][metric] = sum / 2
        }
      }
    }
  }
  if (missingSummaryMetrics.length) return { summaryBinding: "NOT_VERIFIED", missingSummaryMetrics }
  if (!isDeepStrictEqual(values, summaries)) return { summaryBinding: "FAIL",
    summaryError: "PRODUCT_MEMORY_RAW_SUMMARY_MISMATCH", summaryValues: values }
  return { summaryBinding: "PASS", summaryRecipe: statistics.recipe, summaryValues: values }
}
