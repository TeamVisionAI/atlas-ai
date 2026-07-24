import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./MarkdownViewer.css";

export default function MarkdownViewer({ content }) {
  return (
    <article className="markdown-viewer">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ""}</ReactMarkdown>
    </article>
  );
}
