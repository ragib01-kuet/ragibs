import { useEffect, useMemo, useState } from "react";

function extractPublicBucketPath(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    const marker = "/storage/v1/object/public/";
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    const rest = u.pathname.slice(idx + marker.length); // <bucket>/<path>
    const slash = rest.indexOf("/");
    if (slash === -1) return null;
    const bucket = rest.slice(0, slash);
    const path = rest.slice(slash + 1);
    if (!bucket || !path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

export function SimulationFrame({
  url,
  title,
  className,
  onLoaded,
}: {
  url: string;
  title: string;
  className?: string;
  onLoaded?: () => void;
}) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const baseHref = useMemo(() => {
    try {
      const u = new URL(url);
      // Ensure relative asset URLs inside the HTML resolve.
      return `${u.origin}${u.pathname.split("/").slice(0, -1).join("/")}/`;
    } catch {
      return "";
    }
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      setFailed(false);
      setSrcDoc(null);

      // Only attempt srcDoc for public bucket assets (typical simulation uploads).
      // Otherwise, fall back to direct iframe src.
      const parsed = extractPublicBucketPath(url);
      if (!parsed) return;

      try {
        const res = await fetch(url, {
          signal: controller.signal,
          credentials: "omit",
          cache: "no-cache",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        if (cancelled) return;

        // Inject base href + a small guard so the simulation can resolve assets.
        const injected = html.includes("<head")
          ? html.replace(
              /<head(\s[^>]*)?>/i,
              (m) => `${m}\n<base href=\"${baseHref}\" />\n`,
            )
          : `<!doctype html><head><base href=\"${baseHref}\" /></head>${html}`;

        setSrcDoc(injected);
      } catch {
        if (cancelled) return;
        setFailed(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, baseHref]);

  if (srcDoc && !failed) {
    return (
      <iframe
        key={url}
        title={title}
        srcDoc={srcDoc}
        className={className}
        sandbox="allow-scripts allow-forms"
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={onLoaded}
      />
    );
  }

  return (
    <iframe
      key={url}
      title={title}
      src={url}
      className={className}
      sandbox="allow-scripts allow-forms allow-same-origin"
      referrerPolicy="no-referrer"
      loading="lazy"
      onLoad={onLoaded}
    />
  );
}
