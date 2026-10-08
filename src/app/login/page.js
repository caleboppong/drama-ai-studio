"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (error) {
      setMessage(error.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <Link href="/" className="auth-logo">
          <span>D</span>
          <div>
            <strong>DramaAI</strong>
            <small>Studio</small>
          </div>
        </Link>

        <div>
          <p className="auth-eyebrow">WELCOME BACK</p>

          <h1>
            Continue your
            <br />
            next story.
          </h1>

          <p className="auth-description">
            Your series, episodes and generation history stay together in one
            creator workspace.
          </p>
        </div>

        <p className="auth-footer">
          From one idea to a complete episodic drama.
        </p>
      </section>

      <section className="auth-form-side">
        <form className="auth-card" onSubmit={handleLogin}>
          <div className="auth-mobile-logo">
            <span>D</span>
            <strong>DramaAI Studio</strong>
          </div>

          <p className="auth-step">CREATOR LOGIN</p>
          <h2>Welcome back</h2>

          <p className="auth-subtitle">
            Sign in to continue creating your dramas.
          </p>

          <label>
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
            />
          </label>

          <button className="auth-button" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>

          {message && <div className="auth-message">{message}</div>}

          <p className="auth-switch">
            New to DramaAI? <Link href="/signup">Create an account</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
