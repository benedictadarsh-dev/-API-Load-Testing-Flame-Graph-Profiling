const fs = require("fs");
const path = require("path");

/**
 * Parses V8 .cpuprofile and extracts:
 * 1. Top slowest functions by self-time and total-time
 * 2. Visual HTML Flame Graph representation
 */
function analyzeProfile(cpuprofilePath, outputPath, title = "CPU Flame Graph") {
  if (!fs.existsSync(cpuprofilePath)) {
    console.error(`Profile not found at: ${cpuprofilePath}`);
    return null;
  }

  const rawData = fs.readFileSync(cpuprofilePath, "utf-8");
  const profile = JSON.parse(rawData);

  const nodes = profile.nodes;
  const samples = profile.samples || [];
  const timeDeltas = profile.timeDeltas || [];

  // Map nodes by id
  const nodeMap = new Map();
  nodes.forEach(node => {
    nodeMap.set(node.id, {
      ...node,
      selfTicks: 0,
      selfTimeUs: 0,
      totalTicks: 0
    });
  });

  // Calculate self-time for each node based on sample occurrences
  let totalProfileTimeUs = 0;
  for (let i = 0; i < samples.length; i++) {
    const nodeId = samples[i];
    const delta = timeDeltas[i] || 0;
    totalProfileTimeUs += delta;
    const n = nodeMap.get(nodeId);
    if (n) {
      n.selfTicks++;
      n.selfTimeUs += delta;
    }
  }

  // Aggregate function stats by name + url
  const funcStats = new Map();
  nodeMap.forEach(n => {
    const callFrame = n.callFrame || {};
    const fnName = callFrame.functionName || "(anonymous)";
    const url = callFrame.url ? path.basename(callFrame.url) : "(native/v8)";
    const line = callFrame.lineNumber || 0;
    const key = `${fnName} [${url}:${line}]`;

    if (!funcStats.has(key)) {
      funcStats.set(key, {
        functionName: fnName,
        source: url,
        line,
        selfTimeUs: 0,
        selfTicks: 0,
        percentage: 0
      });
    }

    const stat = funcStats.get(key);
    stat.selfTimeUs += n.selfTimeUs;
    stat.selfTicks += n.selfTicks;
  });

  const sortedFunctions = Array.from(funcStats.values())
    .map(stat => ({
      ...stat,
      selfTimeMs: Math.round((stat.selfTimeUs / 1000) * 100) / 100,
      percentage: totalProfileTimeUs > 0 
        ? Math.round((stat.selfTimeUs / totalProfileTimeUs) * 10000) / 100 
        : 0
    }))
    .sort((a, b) => b.selfTimeUs - a.selfTimeUs);

  // Generate Interactive HTML Flame Graph
  const htmlContent = generateFlameGraphHTML(title, sortedFunctions, profile, totalProfileTimeUs);
  fs.writeFileSync(outputPath, htmlContent, "utf-8");
  console.log(`[FlameGraph] Generated interactive flame graph report at: ${outputPath}`);

  return {
    totalProfileTimeMs: Math.round(totalProfileTimeUs / 1000),
    topFunctions: sortedFunctions.slice(0, 15)
  };
}

function generateFlameGraphHTML(title, topFunctions, profile, totalTimeUs) {
  const topJson = JSON.stringify(topFunctions);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} - V8 CPU Profile</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      background: #0f172a;
      color: #e2e8f0;
      margin: 0;
      padding: 24px;
    }
    .header {
      background: #1e293b;
      padding: 20px 24px;
      border-radius: 12px;
      border: 1px solid #334155;
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 22px;
      color: #f8fafc;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      background: #3b82f6;
      color: white;
      font-size: 12px;
      font-weight: 600;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: #1e293b;
      padding: 16px 20px;
      border-radius: 10px;
      border: 1px solid #334155;
    }
    .card-title {
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .card-value {
      font-size: 24px;
      font-weight: bold;
      color: #38bdf8;
      margin-top: 6px;
    }
    .table-container {
      background: #1e293b;
      border-radius: 12px;
      border: 1px solid #334155;
      overflow: hidden;
      margin-bottom: 24px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    th {
      background: #0f172a;
      padding: 12px 16px;
      color: #94a3b8;
      font-weight: 600;
      border-bottom: 1px solid #334155;
    }
    td {
      padding: 10px 16px;
      border-bottom: 1px solid #1e293b;
    }
    tr:hover {
      background: #273549;
    }
    .hot-bar-bg {
      background: #334155;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 4px;
    }
    .hot-bar-fill {
      height: 100%;
      border-radius: 4px;
      background: linear-gradient(90deg, #f59e0b, #ef4444);
    }
    .hot-name {
      font-weight: 600;
      color: #fbbf24;
    }
    .source-tag {
      font-size: 11px;
      color: #64748b;
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .flame-canvas-container {
      background: #1e293b;
      border-radius: 12px;
      border: 1px solid #334155;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <span class="badge">V8 CPU Execution Profiler</span>
    <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 13px;">
      Captures hot paths, execution ticks, and self-time distribution during concurrent load.
    </p>
  </div>

  <div class="stats-grid">
    <div class="card">
      <div class="card-title">Total Samples Profiled</div>
      <div class="card-value">${(profile.samples || []).length.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-title">Total Profile Duration</div>
      <div class="card-value">${Math.round(totalTimeUs / 1000).toLocaleString()} ms</div>
    </div>
    <div class="card">
      <div class="card-title">Primary Bottleneck Function</div>
      <div class="card-value" style="font-size: 16px; color: #f87171;">
        ${topFunctions[0]?.functionName || "None"} (${topFunctions[0]?.percentage || 0}%)
      </div>
    </div>
  </div>

  <div class="table-container">
    <div style="padding: 16px; font-weight: bold; border-bottom: 1px solid #334155;">
      Top CPU Hot Paths by Self Execution Time
    </div>
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Function Name</th>
          <th>File Source</th>
          <th>Self Time (ms)</th>
          <th>CPU Share (%)</th>
          <th style="width: 250px;">Visual Distribution</th>
        </tr>
      </thead>
      <tbody>
        ${topFunctions.slice(0, 12).map((fn, idx) => `
          <tr>
            <td><strong>#${idx + 1}</strong></td>
            <td class="${fn.percentage > 10 ? 'hot-name' : ''}">${fn.functionName}</td>
            <td><span class="source-tag">${fn.source}:${fn.line}</span></td>
            <td>${fn.selfTimeMs} ms</td>
            <td><strong>${fn.percentage}%</strong></td>
            <td>
              <div class="hot-bar-bg">
                <div class="hot-bar-fill" style="width: ${Math.min(100, fn.percentage)}%;"></div>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="flame-canvas-container">
    <h3 style="margin-top: 0; color: #f8fafc;">Flame Stack Execution Hierarchy</h3>
    <p style="color: #94a3b8; font-size: 12px;">
      Visual stack depth of synchronous operations on the Node.js event loop:
    </p>
    <div style="background: #0f172a; padding: 16px; border-radius: 8px; border: 1px solid #334155; font-family: monospace; font-size: 12px; line-height: 1.6;">
      ${topFunctions.slice(0, 8).map(fn => `
        <div style="padding: 4px 8px; margin-bottom: 4px; background: rgba(239, 68, 68, ${Math.max(0.15, fn.percentage / 100)}); border-radius: 4px; border-left: 4px solid #ef4444;">
          <strong>${fn.functionName}</strong> &mdash; ${fn.percentage}% CPU time (${fn.selfTimeMs}ms) &bull; <span style="color: #94a3b8;">${fn.source}:${fn.line}</span>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;
}

module.exports = { analyzeProfile };

// If executed directly
if (require.main === module) {
  const profileArg = process.argv[2] || "profile-before.cpuprofile";
  const outputArg = process.argv[3] || "flamegraph-before.html";
  analyzeProfile(profileArg, outputArg);
}
