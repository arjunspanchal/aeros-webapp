/** @type {import('next').NextConfig} */
const nextConfig = {
  // exceljs (quote Excel export) is a Node library: load it at run time on the
  // server instead of bundling it.
  experimental: { serverComponentsExternalPackages: ["exceljs"] },
  // The old bag, box, cup, wrap and PP calculators and the customer
  // calculator were retired by 28-Nov-2026: old bookmarks land on what
  // replaced them.
  async redirects() {
    const to = (source, destination) => ({ source, destination, permanent: false });
    return [
      to("/calculator/admin", "/calculator/v2"),
      to("/calculator/admin/box", "/calculator/v2"),
      to("/calculator/admin/cup", "/calculator/v2"),
      to("/calculator/admin/wrap", "/calculator/v2"),
      to("/calculator/admin/pp", "/calculator/v2"),
      to("/calculator/admin/paper-rates", "/calculator/v2/papers"),
      to("/calculator/admin/history", "/calculator/v2/quotes"),
      to("/calculator/admin/rates", "/calculator/v2/rates"),
      to("/calculator/client", "/calculator"),
      to("/calculator/client/:path*", "/calculator"),
    ];
  },
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
