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
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [postcode, setPostcode] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSignup(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    if (![name, phone, address, city, country].every((value) => value.trim())) { setMessage("Please complete all required contact and address fields."); setLoading(false); return; }
    if (!/^\+[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g, ""))) { setMessage("Enter a phone number with international country code, for example +447700900000."); setLoading(false); return; }
    if (password !== confirmPassword) { setMessage("Passwords do not match."); setLoading(false); return; }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
          phone: phone.trim(),
          address_line1: address.trim(),
          city: city.trim(),
          country: country.trim(),
          postcode: postcode.trim(),
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
    router.push("/studio");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="auth-art" aria-hidden="true" />
        <div className="auth-light auth-light-one" aria-hidden="true" />
        <div className="auth-light auth-light-two" aria-hidden="true" />
        <Link href="/" className="auth-logo">
          <span className="auth-logo-play" aria-hidden="true">▶</span>
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

        <div className="auth-scene-card" aria-hidden="true"><span className="auth-scene-play">▶</span><span><strong>Every story deserves the big screen.</strong><small>CREATE · DIRECT · SHARE</small></span></div>
        <p className="auth-footer">
          Create stories. Generate episodes. Build an audience.
        </p>
      </section>

      <section className="auth-form-side">
        <div className="auth-orb auth-orb-one" aria-hidden="true" />
        <div className="auth-orb auth-orb-two" aria-hidden="true" />
        <form className="auth-card" onSubmit={handleSignup}>
          <div className="auth-mobile-logo">
            <span className="auth-logo-play" aria-hidden="true">▶</span>
            <strong>DramaAI Studio</strong>
          </div>

          <p className="auth-step">START CREATING</p>
          <h2>Create your account</h2>
          <p className="auth-subtitle">
            Start building your first AI drama series.
          </p>

          <label>
            Full legal name
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

          <label>Confirm password<input type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" /></label>
          <label>Phone number (required)<input type="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 7700 900000" /></label>
          <label>Street address (required)<input type="text" autoComplete="street-address" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street and house number" /></label>
          <label>City / Town (required)<input type="text" autoComplete="address-level2" required value={city} onChange={(e) => setCity(e.target.value)} /></label>
          <label>Country (required)<input type="text" autoComplete="country-name" required value={country} onChange={(e) => setCountry(e.target.value)} /></label>
          <label>Postcode / ZIP (where applicable)<input type="text" autoComplete="postal-code" value={postcode} onChange={(e) => setPostcode(e.target.value)} /></label>
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