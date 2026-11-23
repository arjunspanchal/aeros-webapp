/** @type {import('next').NextConfig} */
const nextConfig = {
  // exceljs (quote Excel export) is a Node library: load it at run time on the
  // server instead of bundling it.
  experimental: { serverComponentsExternalPackages: ["exceljs"] },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.airtableusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'dl.airtable.com',
      },
      {
        protocol: 'https',
        hostname: 'v5.airtableusercontent.com',
      },
    ],
  },
};

export default nextConfig;
