/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure proper client/server component handling
  experimental: {
    serverComponentsExternalPackages: [],
  },
  // Ensure proper file generation
  trailingSlash: false,
  // Disable static optimization for pages that need client-side rendering
  swcMinify: true,
};

export default nextConfig;
