"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSignup(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (!data.session) {
      setName("");
      setEmail("");
      setPassword("");
      setMessage(
        "Account created. Check your email and confirm your account before signing in."
      );
      setLoading(false);
      return;
    }

    setName("");
    setEmail("");
    setPassword("");
    router.push("/");
    router.refresh();
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
          <p className="auth-eyebrow">AI DRAMA CREATION</p>
          <h1>
            Your story.
            <br />
            Your series.
            <br />
            Your audience.
          </h1>

          <p className="auth-description">
            Create episodic AI dramas for TikTok, Instagram Reels and YouTube
            Shorts from one simple idea.
          </p>
        </div>

        <p className="auth-footer">
          Create stories. Generate episodes. Build an audience.
        </p>
      </section>

      <section className="auth-form-side">
        <form className="auth-card" onSubmit={handleSignup}>
          <div className="auth-mobile-logo">
            <span>D</span>
            <strong>DramaAI Studio</strong>
          </div>

          <p className="auth-step">START CREATING</p>
          <h2>Create your account</h2>
          <p className="auth-subtitle">
            Start building your first AI drama series.
          </p>

          <label>
            Creator name
            <input
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
          </label>

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
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
            />
          </label>

          <button className="auth-button" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </button>

          {message && <div className="auth-message">{message}</div>}

          <p className="auth-switch">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </form>
      </section>
    </main>
  );
}