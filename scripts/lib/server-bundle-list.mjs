export function parseServerBundleList(content) {
  const packages = [];
  const seen = new Set();

  for (const rawLine of content.split(/\r?\n/u)) {
    const packageName = rawLine.replace(/#.*/u, "").trim();
    if (!packageName) continue;
    if (!/^@[a-z0-9-]+\/[a-z0-9._-]+$/u.test(packageName)) {
      throw new Error(`Invalid plugin package name: ${packageName}`);
    }
    if (seen.has(packageName)) {
      throw new Error(`Duplicate plugin package: ${packageName}`);
    }
    seen.add(packageName);
    packages.push(packageName);
  }

  return packages;
}
