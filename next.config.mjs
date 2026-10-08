/** @type {import('next').NextConfig} */
const nextConfig = {
  // The floating Next.js badge covers the first tab of the mobile bottom bar while developing.
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      // Notes (spreadsheet) page is hidden for now; send any direct visits to the dashboard.
      { source: '/dashboard/sheets', destination: '/dashboard', permanent: false },
      { source: '/dashboard/sheets/:path*', destination: '/dashboard', permanent: false },
    ];
  },
}

export default nextConfig
