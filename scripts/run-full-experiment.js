const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { runBenchmark } = require("./run-benchmark");
const { analyzeProfile } = require("./generate-flamegraph");

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function waitForServer(url = "http://localhost:3001/health", maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) {
      // server still booting
    }
    await sleep(300);
  }
  throw new Error("Server failed to respond within timeout");
}

function startServerWithProfiling(profileName) {
  const serverPath = path.join(__dirname, "..", "server.js");
  const child = spawn(
    process.execPath,
    [`--cpu-prof`, `--cpu-prof-name=${profileName}`, serverPath],
    {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit"
    }
  );
  return child;
}

async function stopServerGracefully(child) {
  try {
    await fetch("http://localhost:3001/admin/shutdown");
  } catch (e) {
    // ignore
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  console.log("================================================================================");
  console.log("PROJECT 27: FULL LOAD TEST & FLAME GRAPH PROFILING EXPERIMENT RUNNER");
  console.log("================================================================================");

  const workDir = path.join(__dirname, "..");

  // -------------------------------------------------------------------------
  // PHASE 1: Profiling & Load Testing the UNOPTIMIZED API (BEFORE)
  // -------------------------------------------------------------------------
  console.log("\n>>> PHASE 1: Starting Unoptimized Server with V8 CPU Profiler...");
  const beforeProfileName = "profile-before.cpuprofile";
  const beforeProfilePath = path.join(workDir, beforeProfileName);
  if (fs.existsSync(beforeProfilePath)) fs.unlinkSync(beforeProfilePath);

  const serverBefore = startServerWithProfiling(beforeProfileName);
  await waitForServer();
  console.log("Server online. Commencing autocannon load test...");

  const beforeResults = await runBenchmark({
    url: "http://localhost:3001/api/report/unoptimized",
    connections: 50,
    duration: 10,
    outputFile: path.join(workDir, "benchmark-before.json"),
    title: "BEFORE (Unoptimized Bottleneck)"
  });

  console.log("Stopping server to flush V8 CPU profile...");
  await stopServerGracefully(serverBefore);
  await sleep(1500); // Give file system a moment to finish write

  console.log("Analyzing V8 profile and generating flame graph...");
  const beforeAnalysis = analyzeProfile(
    beforeProfilePath,
    path.join(workDir, "flamegraph-before.html"),
    "Flame Graph: UNOPTIMIZED (Hot Path Detected)"
  );

  // -------------------------------------------------------------------------
  // PHASE 2: Profiling & Load Testing the OPTIMIZED API (AFTER)
  // -------------------------------------------------------------------------
  console.log("\n>>> PHASE 2: Starting Optimized Server with V8 CPU Profiler...");
  const afterProfileName = "profile-after.cpuprofile";
  const afterProfilePath = path.join(workDir, afterProfileName);
  if (fs.existsSync(afterProfilePath)) fs.unlinkSync(afterProfilePath);

  const serverAfter = startServerWithProfiling(afterProfileName);
  await waitForServer();
  console.log("Server online. Commencing autocannon load test under identical load...");

  const afterResults = await runBenchmark({
    url: "http://localhost:3001/api/report/optimized",
    connections: 50,
    duration: 10,
    outputFile: path.join(workDir, "benchmark-after.json"),
    title: "AFTER (Optimized $O(1)$ Hash Map & Streamlined Logic)"
  });

  console.log("Stopping server to flush V8 CPU profile...");
  await stopServerGracefully(serverAfter);
  await sleep(1500);

  console.log("Analyzing V8 profile and generating flame graph...");
  const afterAnalysis = analyzeProfile(
    afterProfilePath,
    path.join(workDir, "flamegraph-after.html"),
    "Flame Graph: OPTIMIZED (Bottlenecks Eliminated)"
  );

  // -------------------------------------------------------------------------
  // PHASE 3: Comparative Analysis & Metric Synthesis
  // -------------------------------------------------------------------------
  const rpsBefore = beforeResults.requests.average;
  const rpsAfter = afterResults.requests.average;
  const rpsGainX = (rpsAfter / rpsBefore).toFixed(1);

  const p95Before = beforeResults.latency.p95;
  const p95After = afterResults.latency.p95;
  const p95Reduction = (((p95Before - p95After) / p95Before) * 100).toFixed(1);

  const p99Before = beforeResults.latency.p99;
  const p99After = afterResults.latency.p99;
  const p99Reduction = (((p99Before - p99After) / p99Before) * 100).toFixed(1);

  const comparison = {
    metrics: {
      rps: { before: rpsBefore, after: rpsAfter, speedupFactor: `${rpsGainX}x` },
      meanLatencyMs: { before: beforeResults.latency.average, after: afterResults.latency.average },
      p50LatencyMs: { before: beforeResults.latency.p50, after: afterResults.latency.p50 },
      p90LatencyMs: { before: beforeResults.latency.p90, after: afterResults.latency.p90 },
      p95LatencyMs: { before: p95Before, after: p95After, reductionPercent: `${p95Reduction}%` },
      p99LatencyMs: { before: p99Before, after: p99After, reductionPercent: `${p99Reduction}%` },
      totalRequests: { before: beforeResults.requests.total, after: afterResults.requests.total }
    },
    hotPathFunctions: beforeAnalysis ? beforeAnalysis.topFunctions.slice(0, 5) : []
  };

  fs.writeFileSync(
    path.join(workDir, "comparison-summary.json"),
    JSON.stringify(comparison, null, 2),
    "utf-8"
  );

  console.log("\n================================================================================");
  console.log("EXPERIMENT COMPLETE - RESULTS COMPARISON SUMMARY");
  console.log("================================================================================");
  console.log(`Requests/sec:   ${rpsBefore.toFixed(1)} req/s  -->  ${rpsAfter.toFixed(1)} req/s  (${rpsGainX}x speedup)`);
  console.log(`Mean Latency:   ${beforeResults.latency.average.toFixed(1)} ms  -->  ${afterResults.latency.average.toFixed(1)} ms`);
  console.log(`p95 Latency:    ${p95Before.toFixed(1)} ms  -->  ${p95After.toFixed(1)} ms  (-${p95Reduction}% reduction)`);
  console.log(`p99 Latency:    ${p99Before.toFixed(1)} ms  -->  ${p99After.toFixed(1)} ms  (-${p99Reduction}% reduction)`);
  console.log(`Total Handled:  ${beforeResults.requests.total}  -->  ${afterResults.requests.total} requests`);
  console.log("================================================================================");
  console.log("Flame graphs saved to:");
  console.log("  - flamegraph-before.html");
  console.log("  - flamegraph-after.html");
  console.log("================================================================================");
}

main().catch(err => {
  console.error("Experiment failed:", err);
  process.exit(1);
});
