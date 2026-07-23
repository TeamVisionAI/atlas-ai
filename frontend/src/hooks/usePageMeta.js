import { useEffect } from "react";

export function usePageMeta({ title, description }) {
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

    return () => {
      document.title = previousTitle;

      if (createdMeta) {
        metaDescription.remove();
      } else {
        metaDescription.setAttribute("content", previousDescription);
      }
    };
  }, [title, description]);
}
