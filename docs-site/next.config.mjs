import path from 'node:path';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  generateBuildId: async () => 'sitescout-docs',
  turbopack: {
    root: path.resolve(import.meta.dirname, '..'),
  },
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
