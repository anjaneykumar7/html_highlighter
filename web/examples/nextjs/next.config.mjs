import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// This example sits inside the library's folder, which has its own lockfile;
// pin the root so Next.js doesn't treat the library as the workspace.
const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  turbopack: { root },
  outputFileTracingRoot: root,
};
