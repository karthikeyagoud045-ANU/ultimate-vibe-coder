"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    // DEV MODE: Auto-redirect to dashboard
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="landing-page">
      <div className="landing-bg" />
      <div className="landing-content">
        <div className="landing-card glass">
          <div className="landing-logo">
            <div className="landing-logo-icon">⚡</div>
            <h1>Vibe Code</h1>
          </div>
          <p className="landing-subtitle">Redirecting to dashboard...</p>
          <div className="spinner" />
        </div>
      </div>
    </div>
  );
}
