export function evaluateMainSourcePolicy({ baseRef, headRef, allowHotfix }) {
  if (baseRef !== "main") {
    return {
      allowed: true,
      message: "Pull request does not target main.",
    };
  }

  if (headRef === "dev") {
    return {
      allowed: true,
      message: "Production promotion correctly originates from dev.",
    };
  }

  if (allowHotfix && headRef?.startsWith("hotfix/")) {
    return {
      allowed: true,
      message: `Approved hotfix source: ${headRef}`,
    };
  }

  return {
    allowed: false,
    message: `Pull requests into main must originate from dev. Received: ${headRef}`,
  };
}
