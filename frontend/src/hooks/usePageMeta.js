import { useEffect } from "react";

function upsertMeta(attr, key, content) {
  if (!content) {
    return null;
  }
  const selector = `meta[${attr}="${key}"]`;
  let el = document.querySelector(selector);
  const created = !el;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const previous = el.getAttribute("content") || "";
  el.setAttribute("content", content);
  return { el, created, previous };
}

/**
 * @param {{ title: string, description: string, ogTitle?: string, ogImage?: string, twitterImage?: string }} meta
 */
export function usePageMeta({ title, description, ogTitle, ogImage, twitterImage }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let metaDescription = document.querySelector('meta[name="description"]');
    const createdMeta = !metaDescription;

    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }

    const previousDescription = metaDescription.getAttribute("content") || "";
    metaDescription.setAttribute("content", description);

    const ogTitleMeta = upsertMeta("property", "og:title", ogTitle);
    const ogImageMeta = upsertMeta("property", "og:image", ogImage);
    const twitterImageMeta = upsertMeta(
      "name",
      "twitter:image",
      twitterImage || ogImage
    );
    if (ogTitle) {
      upsertMeta("name", "twitter:title", ogTitle);
    }

    return () => {
      document.title = previousTitle;

      if (createdMeta) {
        metaDescription.remove();
      } else {
        metaDescription.setAttribute("content", previousDescription);
      }

      for (const entry of [ogTitleMeta, ogImageMeta, twitterImageMeta]) {
        if (!entry) continue;
        if (entry.created) {
          entry.el.remove();
        } else {
          entry.el.setAttribute("content", entry.previous);
        }
      }
    };
  }, [title, description, ogTitle, ogImage, twitterImage]);
}
