// Is a nav item the current page? Shared by the sidebar and the phone tab bar.
//   exact  only the page itself
//   also   other path prefixes that belong to this item (e.g. the admin job page under "Jobs")
//   not    path prefixes that belong to a different item
export function isNavActive(pathname, item) {
  const under = (p) => pathname === p || pathname.startsWith(`${p}/`);
  if ((item.not || []).some(under)) return false;
  if (item.exact) return pathname === item.href || (item.also || []).some(under);
  return under(item.href) || (item.also || []).some(under);
}
