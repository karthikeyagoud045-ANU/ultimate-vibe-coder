"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Template {
  id: string;
  title: string;
  description: string;
  author_name: string;
  language: string;
  fork_count: number;
  tags: string[];
  preview_image_url: string | null;
  created_at: string;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "12",
        });
        if (search) params.set("search", search);
        if (language) params.set("language", language);

        const res = await fetch(`/api/templates?${params}`);
        const data = await res.json();

        if (!cancelled) {
          setTemplates(data.templates || []);
          setTotalPages(data.totalPages || 1);
        }
      } catch {
        console.error("Failed to fetch templates");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [page, language, search]);

  const handleFork = async (templateId: string) => {
    try {
      const res = await fetch("/api/templates/fork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();

      if (data.roomId) {
        router.push(`/room/${data.roomId}`);
      } else {
        alert(data.error || "Failed to fork template");
      }
    } catch {
      alert("Failed to fork template");
    }
  };

  const languages = [
    { value: "", label: "All Languages" },
    { value: "javascript", label: "JavaScript" },
    { value: "typescript", label: "TypeScript" },
    { value: "python", label: "Python" },
    { value: "html", label: "HTML/CSS" },
    { value: "go", label: "Go" },
    { value: "rust", label: "Rust" },
  ];

  return (
    <div className="templates-page">
      <div className="templates-header">
        <div className="templates-header-content">
          <Link href="/" className="templates-back">
            ← Back to IDE
          </Link>
          <h1 className="templates-title">Community Templates</h1>
          <p className="templates-subtitle">
            Fork community-built projects and start vibe coding instantly
          </p>
        </div>

        <div className="templates-filters">
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="templates-search"
          />
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setPage(1);
            }}
            className="templates-language-select"
          >
            {languages.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="templates-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="template-card-skeleton">
              <div className="skeleton-header" />
              <div className="skeleton-body" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="templates-empty">
          <div className="templates-empty-icon">📦</div>
          <h2>No templates yet</h2>
          <p>Be the first to publish a template!</p>
          <Link href="/" className="btn btn-primary">
            Start Coding
          </Link>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map((template) => (
            <div key={template.id} className="template-card glass">
              <div className="template-card-header">
                <span className="template-language badge badge-blue">
                  {template.language}
                </span>
                <span className="template-forks">
                  🍴 {template.fork_count}
                </span>
              </div>

              <h3 className="template-title">{template.title}</h3>
              <p className="template-description">
                {template.description || "No description"}
              </p>

              {template.tags && template.tags.length > 0 && (
                <div className="template-tags">
                  {template.tags.slice(0, 3).map((tag, i) => (
                    <span key={i} className="template-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="template-footer">
                <span className="template-author">
                  by {template.author_name}
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleFork(template.id)}
                >
                  Fork & Start
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="templates-pagination">
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      <style jsx>{`
        .templates-page {
          min-height: 100vh;
          background: var(--bg-primary);
          padding: var(--space-2xl);
        }

        .templates-header {
          max-width: 1200px;
          margin: 0 auto var(--space-2xl);
          text-align: center;
        }

        .templates-header-content {
          margin-bottom: var(--space-xl);
        }

        .templates-back {
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
          margin-bottom: var(--space-lg);
          display: inline-block;
        }

        .templates-title {
          font-size: var(--font-size-3xl);
          font-weight: 700;
          background: linear-gradient(135deg, var(--text-primary), var(--accent-blue));
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: var(--space-sm);
        }

        .templates-subtitle {
          color: var(--text-secondary);
          font-size: var(--font-size-lg);
        }

        .templates-filters {
          display: flex;
          gap: var(--space-md);
          justify-content: center;
        }

        .templates-search,
        .templates-language-select {
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: var(--font-size-sm);
          min-width: 200px;
        }

        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: var(--space-lg);
          max-width: 1200px;
          margin: 0 auto;
        }

        .template-card {
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
          transition: transform var(--transition-fast), box-shadow var(--transition-fast);
        }

        .template-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-lg);
        }

        .template-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .template-language {
          font-size: var(--font-size-xs);
        }

        .template-forks {
          font-size: var(--font-size-sm);
          color: var(--text-tertiary);
        }

        .template-title {
          font-size: var(--font-size-lg);
          font-weight: 600;
          color: var(--text-primary);
        }

        .template-description {
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
          line-height: 1.5;
          flex: 1;
        }

        .template-tags {
          display: flex;
          gap: var(--space-xs);
          flex-wrap: wrap;
        }

        .template-tag {
          padding: 2px 8px;
          background: var(--bg-primary);
          border-radius: var(--radius-full);
          font-size: var(--font-size-xs);
          color: var(--text-tertiary);
        }

        .template-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: var(--space-md);
          border-top: 1px solid var(--border-primary);
        }

        .template-author {
          font-size: var(--font-size-xs);
          color: var(--text-tertiary);
        }

        .template-card-skeleton {
          background: var(--bg-tertiary);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
          height: 200px;
        }

        .skeleton-header,
        .skeleton-body {
          background: var(--bg-hover);
          border-radius: var(--radius-sm);
          animation: pulse 1.5s infinite;
        }

        .skeleton-header {
          height: 20px;
          width: 40%;
          margin-bottom: var(--space-md);
        }

        .skeleton-body {
          height: 60px;
          width: 100%;
        }

        .templates-empty {
          text-align: center;
          padding: var(--space-3xl);
          max-width: 400px;
          margin: 0 auto;
        }

        .templates-empty-icon {
          font-size: 3rem;
          margin-bottom: var(--space-lg);
        }

        .templates-empty h2 {
          color: var(--text-primary);
          margin-bottom: var(--space-sm);
        }

        .templates-empty p {
          color: var(--text-secondary);
          margin-bottom: var(--space-lg);
        }

        .templates-pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: var(--space-md);
          margin-top: var(--space-2xl);
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
