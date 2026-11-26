import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Check authored source only; third-party bundles are managed by vendor-rich.py.
for (const directory of ["dist", "tools", "tests"]) {
  for (const file of readdirSync(
    new URL(`../${directory}/`, import.meta.url),
  ).sort()) {
    if (/\.(?:js|mjs|cjs)$/.test(file))
      run(["--check", `${directory}/${file}`]);
  }
}
for (const file of ["feed.cjs", "account.cjs", "news.mjs", "articles.cjs"]) {
  run([`tests/${file}`]);
}
console.log("All checks passed.");
