export function safeNext(value?: string | null) {
  if (typeof value !== 'string' || !value || value.length > 2048) return '/dashboard';
  let decoded = value;
  try {
    for (let i = 0; i < 3; i++) {
      if (!/^\/(?!\/)/.test(decoded) || /[\\\u0000-\u001f\u007f]/.test(decoded))
        return '/dashboard';
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (!/^\/(?!\/)/.test(decoded) || /[\\\u0000-\u001f\u007f]/.test(decoded)) return '/dashboard';
    if (/^\/auth(?:\/|$)/.test(new URL(decoded, 'https://internal.invalid').pathname))
      return '/dashboard';
    const url = new URL(value, 'https://internal.invalid');
    if (
      url.origin !== 'https://internal.invalid' ||
      !/^\/(?!\/)/.test(url.pathname) ||
      /^\/auth(?:\/|$)/.test(url.pathname)
    )
      return '/dashboard';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/dashboard';
  }
}
