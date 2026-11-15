import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * The tracking portal is a long-lived page on a phone: it holds a geolocation
   * watch and a socket for hours. Source maps in production make the inevitable
   * field bug reports readable without shipping a debug build.
   */
  productionBrowserSourceMaps: true,

  eslint: {
    dirs: ['src'],
  },
};

export default nextConfig;
