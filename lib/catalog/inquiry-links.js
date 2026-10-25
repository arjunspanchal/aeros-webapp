// WhatsApp / email inquiry links for a catalogue product. Pure (no server
// imports) so the client ProductCard can build them on render instead of the
// server shipping ~1.5 MB of pre-encoded URLs for ~1,700 cards in the payload.

export const WHATSAPP_NUMBER = "917977077571";
export const EMAIL_ADDRESS = "clearance@aeros-x.com";

// Pricing is intentionally omitted from inquiry templates — the public
// catalogue is "Price on request"; pricing only lives in /catalog/manage
// for admins and on rate cards for specific customers.
export function buildWhatsAppUrl(product) {
  const msg = `Hi, I'm interested in this product from Aeros — ${product.productName} (SKU: ${product.sku}) — Category: ${product.category} — Size: ${product.sizeVolume || "N/A"} — Could you share pricing and more details?`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

export function buildEmailUrl(product) {
  const subject = `Product Inquiry: ${product.productName} (${product.sku})`;
  const body = `Hi,\n\nI'm interested in the following product from your catalog:\n\nProduct: ${product.productName}\nSKU: ${product.sku}\nCategory: ${product.category}\nSize: ${product.sizeVolume || "N/A"}\n\nCould you please share pricing and availability?\n\nThanks`;
  return `mailto:${EMAIL_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
