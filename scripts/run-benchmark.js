const autocannon = require("autocannon");
const fs = require("fs");
const path = require("path");

async function runBenchmark({
  url = "http://localhost:3001/api/report/unoptimized",
  connections = 40,
  duration = 8,
  outputFile = null,
  title = "API Benchmark"
}) {
  console.log(`\n======================================================`);
  console.log(`Starting Autocannon Load Test: ${title}`);
  console.log(`Target URL:    ${url}`);
  console.log(`Concurrency:   ${connections} concurrent connections`);
  console.log(`Duration:      ${duration} seconds`);
  console.log(`======================================================\n`);

  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url,
        connections,
        duration,
        pipelining: 1,
        headers: {
          "Accept": "application/json"
        }
      },
      (err, results) => {
        if (err) {
          console.error("Autocannon test failed:", err);
          return reject(err);
        }

        const p50 = results.latency.p50 || 0;
        const p90 = results.latency.p90 || 0;
        const p97_5 = results.latency.p97_5 || 0;
        // p95 interpolation between p90 and p97_5
        const p95 = results.latency.p95 || Math.round(((p90 * 1 + p97_5 * 2) / 3) * 100) / 100;
        const p99 = results.latency.p99 || 0;

        results.latency.p95 = p95;

        console.log(`--- [${title}] Results Summary ---`);
        console.log(`Requests/sec:  ${results.requests.average.toFixed(1)} req/s`);
        console.log(`Total Requests: ${results.requests.total}`);
        console.log(`Mean Latency:  ${results.latency.average.toFixed(2)} ms`);
        console.log(`p50 Latency:   ${p50.toFixed(2)} ms`);
        console.log(`p90 Latency:   ${p90.toFixed(2)} ms`);
        console.log(`p95 Latency:   ${p95.toFixed(2)} ms`);
        console.log(`p99 Latency:   ${p99.toFixed(2)} ms`);
        console.log(`Errors / 5xx:  ${results.errors + results.non2xx}`);

        if (outputFile) {
          fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), "utf-8");
          console.log(`Saved benchmark metrics to ${outputFile}`);
        }

        resolve(results);
      }
    );

    autocannon.track(instance, { renderProgressBar: true });
  });
}

module.exports = { runBenchmark };

if (require.main === module) {
  const args = process.argv.slice(2);
  const target = args.find(a => a.startsWith("--target="))?.split("=")[1] || "unoptimized";
  const url = target === "optimized" 
    ? "http://localhost:3001/api/report/optimized"
    : "http://localhost:3001/api/report/unoptimized";
  const outputFile = `benchmark-${target}.json`;

  runBenchmark({
    url,
    connections: 40,
    duration: 8,
    outputFile,
    title: target.toUpperCase()
  });
}
