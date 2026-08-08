const MANAGED_BY = "edgegamers-s2s";

function ensureManagedManifest(manifest) {
  if (!manifest) return undefined;
  if (manifest.schemaVersion !== 1) {
    throw new Error("Unsupported development manifest schema");
  }
  if (manifest.managedBy !== MANAGED_BY) {
    throw new Error("Unsupported development manifest owner");
  }
  if (!Array.isArray(manifest.plugins)) {
    throw new Error("Development manifest plugins must be an array");
  }
  return manifest;
}

export function listManagedFileNames(manifest) {
  const managedManifest = ensureManagedManifest(manifest);
  if (!managedManifest) return [];

  const fileNames = managedManifest.plugins.map((plugin) => {
    if (typeof plugin.fileName !== "string" || !plugin.fileName.endsWith(".s2sp")) {
      throw new Error("Development manifest plugin fileName must be a .s2sp file");
    }
    if (plugin.fileName.includes("/") || plugin.fileName.includes("\\")) {
      throw new Error(`Unsafe plugin file name: ${plugin.fileName}`);
    }
    return plugin.fileName;
  });

  return [...new Set(fileNames)].sort();
}

function managedRelativePath(plugin) {
  const installPath = plugin.installPath ?? (plugin.enabled === false ? "disabled" : "enabled");
  if (installPath === "enabled") return plugin.fileName;
  if (installPath === "disabled") return `disabled/${plugin.fileName}`;
  throw new Error(`Unsupported plugin install path: ${installPath}`);
}

function listManagedPlugins(manifest) {
  const managedManifest = ensureManagedManifest(manifest);
  if (!managedManifest) return [];

  return managedManifest.plugins.map((plugin) => {
    if (typeof plugin.fileName !== "string" || !plugin.fileName.endsWith(".s2sp")) {
      throw new Error("Development manifest plugin fileName must be a .s2sp file");
    }
    if (plugin.fileName.includes("/") || plugin.fileName.includes("\\")) {
      throw new Error(`Unsafe plugin file name: ${plugin.fileName}`);
    }

    const relativePath = managedRelativePath(plugin);
    return {
      fileName: plugin.fileName,
      installPath: relativePath === plugin.fileName ? "enabled" : "disabled",
      relativePath,
    };
  });
}

export function planManagedReconcile({ previousManifest, nextManifest }) {
  const previous = new Set(
    listManagedPlugins(previousManifest).map((plugin) => plugin.relativePath),
  );
  const next = listManagedPlugins(nextManifest);
  const nextPaths = new Set(next.map((plugin) => plugin.relativePath));

  return {
    deletePaths: [...previous].filter((path) => !nextPaths.has(path)).sort(),
    copyEntries: next.map(({ fileName, installPath }) => ({
      fileName,
      installPath,
    })),
  };
}

export function validateRemotePluginDirectory(path) {
  if (typeof path !== "string") {
    throw new Error("Unsafe remote plugin directory");
  }

  const normalized = path.trim().replace(/\/+$/u, "");
  if (
    !normalized.startsWith("/") ||
    normalized === "/" ||
    normalized.split("/").filter(Boolean).length < 3
  ) {
    throw new Error(`Unsafe remote plugin directory: ${path}`);
  }

  return normalized;
}

export function quotePosix(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}
