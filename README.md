# API Load Testing and Flame Graph Profiling

An Express.js performance lab that makes an event-loop bottleneck visible, measures its cost under load, and replaces the slow hot path with constant-time lookups and linear-time processing.

The project exposes equivalent report endpoints: one deliberately inefficient and one optimized. It uses Autocannon for repeatable load tests and Node.js V8 CPU profiles to identify the work consuming CPU time.

## What this demonstrates

- API benchmarking with latency percentiles and requests per second
- V8 CPU profiling with `--cpu-prof`
- Finding hot functions from a CPU profile
- Replacing repeated linear scans with `Map` lookups
- Removing redundant cloning, regular-expression work, and nested loops from the request path
- Generating before-and-after flame graph HTML reports

## Prerequisites

- Node.js 18 or later
- npm

## Getting started

```bash
npm install
npm start
```

The API starts at `http://localhost:3001`.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Confirms that the server is running |
| `GET /api/report/unoptimized` | Runs the intentionally CPU-heavy implementation |
| `GET /api/report/optimized` | Runs the optimized implementation |
| `GET /api/report` | Runs the optimized report endpoint |

## Run the experiment

Run the entire profiling and benchmark workflow:

```bash
npm run full-experiment
```

You can also run individual stages:

```bash
npm run benchmark:before
npm run benchmark:after
npm run profile:before
npm run profile:after
npm run generate-flamegraphs
```

Generated benchmark files, CPU profiles, and flame graph pages are ignored by Git so the repository stays focused on source code.

## Project structure

```text
server.js                         Express API and slow/optimized report paths
scripts/run-benchmark.js          Autocannon benchmark runner
scripts/run-full-experiment.js    End-to-end experiment workflow
scripts/generate-flamegraph.js    CPU-profile parser and HTML report generator
```

## Key optimization

The baseline path searches tax rules for every transaction, clones currency data, and performs quadratic string work. The optimized path pre-indexes tax rules in a `Map`, uses fixed conversion factors, and replaces nested string processing with a single pass. Both paths return the same kind of report, which makes the performance difference directly measurable.

