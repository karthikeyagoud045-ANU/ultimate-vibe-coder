"use client";

import React from "react";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = "100%",
  borderRadius = "var(--radius-md)",
  className = "",
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton-loader ${className}`}
      style={{ width, height, borderRadius, ...style }}
    />
  );
}

export function IDESkeleton() {
  return (
    <div className="ide-container">
      <header className="ide-topbar" style={{ padding: "0 var(--space-xl)" }}>
        <div className="topbar-left">
          <Skeleton width="120px" height="28px" />
          <div className="topbar-divider" />
          <Skeleton width="80px" height="24px" borderRadius="var(--radius-full)" />
        </div>

        <div className="topbar-center">
          <Skeleton width="160px" height="24px" borderRadius="var(--radius-full)" />
        </div>

        <div className="topbar-right">
          <Skeleton width="140px" height="32px" borderRadius="var(--radius-full)" />
        </div>
      </header>

      <div className="ide-main">
        <section className="ide-editor-section">
          <div className="panel-header">
            <Skeleton width="100px" height="24px" />
            <div className="panel-actions">
              <Skeleton width="60px" height="28px" />
              <Skeleton width="60px" height="28px" />
              <Skeleton width="80px" height="28px" />
            </div>
          </div>
          <div style={{ padding: "var(--space-md)", height: "100%" }}>
            <Skeleton width="100%" height="100%" />
          </div>
        </section>

        <section className="ide-right-section">
          <div className="tab-bar">
            <Skeleton width="100px" height="32px" borderRadius="var(--radius-md) var(--radius-md) 0 0" />
            <Skeleton width="120px" height="32px" borderRadius="var(--radius-md) var(--radius-md) 0 0" />
            <Skeleton width="80px" height="32px" borderRadius="var(--radius-md) var(--radius-md) 0 0" />
            <Skeleton width="100px" height="32px" borderRadius="var(--radius-md) var(--radius-md) 0 0" />
          </div>
          <div style={{ padding: "var(--space-md)", height: "100%" }}>
            <Skeleton width="100%" height="100%" />
          </div>
        </section>
      </div>
    </div>
  );
}
