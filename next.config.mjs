/** @type {import('next').NextConfig} */
const nextConfig = {
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
