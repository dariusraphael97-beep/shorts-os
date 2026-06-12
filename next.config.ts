import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the Turbopack root to this directory. Without it, root inference walks
  // up to the nearest lockfile — which, when running from a git worktree nested
  // inside the main checkout (.claude/worktrees/*), finds the OUTER repo's
  // package-lock.json and mis-roots the app (every route 404s in dev).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
