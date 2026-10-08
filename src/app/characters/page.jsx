
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const voices = ["coral", "onyx", "shimmer", "marin", "alloy", "nova"];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

async function getAuthHeaders() {
    const {
        data: { session },
        error
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
        throw new Error("Please sign in before managing characters.");
    }

    return {
        Authorization: `Bearer ${session.access_token}`
    };
}

async function readResponse(response) {
    const text = await response.text();
    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `Server returned an invalid response (${response.status}). Check the API route.`
        );
    }

    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status}).`);
    }

    return data;
}

const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #384152",
    background: "#151b28",
    color: "#fff",
    fontSize: 14
};

const labelStyle = {
    display: "block",
    marginBottom: 16,
    color: "#c5cee0",
    fontSize: 14
};

export default function CharactersPage() {
    const [characters, setCharacters] = useState([]);
    const [series, setSeries] = useState([]);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [voice, setVoice] = useState("coral");
    const [seriesId, setSeriesId] = useState("");
    const [file, setFile] = useState(null);
    const [fileKey, setFileKey] = useState(0);
    const [mode, setMode] = useState("upload");
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    const loadData = useCallback(async () => {
        setLoadingData(true);

        try {
            const headers = await getAuthHeaders();

            const charactersResponse = await fetch("/api/characters", {
                headers,
                cache: "no-store"
            });

            const characterData = await readResponse(charactersResponse);

            setCharacters(
                Array.isArray(characterData)
                    ? characterData
                    : characterData.characters || []
            );

            try {
                const seriesResponse = await fetch("/api/series", {
                    headers,
                    cache: "no-store"
                });

                if (seriesResponse.ok) {
                    const seriesData = await seriesResponse.json();

                    setSeries(
                        Array.isArray(seriesData)
                            ? seriesData
                            : seriesData.series || []
                    );
                }
            } catch {
                setSeries([]);
            }
        } catch (error) {
            setErrorMessage(error.message);
        } finally {
            setLoadingData(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    async function handleSubmit(event) {
        event.preventDefault();
        setMessage("");
        setErrorMessage("");

        if (!name.trim()) {
            setErrorMessage("Please enter a character name.");
            return;
        }

        if (mode === "upload" && !file) {
            setErrorMessage("Please select a portrait image.");
            return;
        }

        if (mode === "generate") {
            setErrorMessage(
                "AI portrait generation is not connected yet. Please use Upload Portrait."
            );
            return;
        }

        setLoading(true);

        try {
            const headers = await getAuthHeaders();
            const form = new FormData();

            form.append("name", name.trim());
            form.append("description", description.trim());
            form.append("voice", voice);
            form.append("series_id", seriesId);
            form.append("mode", mode);

            if (file) {
                form.append("file", file);
            }

            const response = await fetch("/api/characters", {
                method: "POST",
                headers,
                body: form
            });

            await readResponse(response);

            setName("");
            setDescription("");
            setVoice("coral");
            setFile(null);
            setFileKey((current) => current + 1);
            setMessage("Character saved successfully.");

            await loadData();
        } catch (error) {
            setErrorMessage(error.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <main
            style={{
                minHeight: "100vh",
                background: "#0b101b",
                color: "#fff",
                padding: "32px 20px"
            }}
        >
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                <Link
                    href="/"
                    style={{
                        color: "#b8c8ff",
                        textDecoration: "none"
                    }}
                >
                    ← Back to Studio
                </Link>

                <h1
                    style={{
                        fontSize: 34,
                        fontWeight: 700,
                        marginTop: 24,
                        marginBottom: 10
                    }}
                >
                    Character Library
                </h1>

                <p
                    style={{
                        color: "#aeb9cd",
                        marginBottom: 28,
                        lineHeight: 1.6
                    }}
                >
                    Save permanent character portraits and reuse them across episodes.
                    Keep Ama and Kwame consistent throughout The Secret Between Us.
                </p>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                        gap: 24,
                        alignItems: "start"
                    }}
                >
                    <form
                        onSubmit={handleSubmit}
                        style={{
                            background: "#171e2c",
                            padding: 24,
                            borderRadius: 16
                        }}
                    >
                        <h2
                            style={{
                                fontSize: 22,
                                fontWeight: 600,
                                marginBottom: 20
                            }}
                        >
                            Add Character
                        </h2>

                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                marginBottom: 20
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    setMode("upload");
                                    setErrorMessage("");
                                }}
                                style={{
                                    ...inputStyle,
                                    cursor: "pointer",
                                    background: mode === "upload" ? "#4359c7" : "#151b28"
                                }}
                            >
                                Upload Portrait
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setMode("generate");
                                    setErrorMessage("");
                                }}
                                style={{
                                    ...inputStyle,
                                    cursor: "pointer",
                                    background: mode === "generate" ? "#4359c7" : "#151b28"
                                }}
                            >
                                Generate AI Portrait
                            </button>
                        </div>

                        <label style={labelStyle}>
                            Character Name
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="Ama"
                                maxLength={100}
                                required
                                style={{
                                    ...inputStyle,
                                    marginTop: 8
                                }}
                            />
                        </label>

                        <label style={labelStyle}>
                            Character Description
                            <textarea
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                placeholder="Appearance and personality"
                                rows={4}
                                style={{
                                    ...inputStyle,
                                    marginTop: 8,
                                    resize: "vertical"
                                }}
                            />
                        </label>

                        <label style={labelStyle}>
                            Voice
                            <select
                                value={voice}
                                onChange={(event) => setVoice(event.target.value)}
                                style={{
                                    ...inputStyle,
                                    marginTop: 8
                                }}
                            >
                                {voices.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={labelStyle}>
                            Series
                            <select
                                value={seriesId}
                                onChange={(event) => setSeriesId(event.target.value)}
                                style={{
                                    ...inputStyle,
                                    marginTop: 8
                                }}
                            >
                                <option value="">No series selected</option>

                                {series.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.title || item.name || "Untitled Series"}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {mode === "upload" ? (
                            <label style={labelStyle}>
                                Upload Portrait
                                <input
                                    key={fileKey}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(event) =>
                                        setFile(event.target.files?.[0] || null)
                                    }
                                    style={{
                                        ...inputStyle,
                                        marginTop: 8
                                    }}
                                />
                                <span
                                    style={{
                                        display: "block",
                                        marginTop: 8,
                                        color: "#8f9db6",
                                        fontSize: 12
                                    }}
                                >
                                    JPG, PNG or WebP. Maximum 10 MB.
                                </span>
                            </label>
                        ) : (
                            <p
                                style={{
                                    color: "#b8c8ff",
                                    marginBottom: 20,
                                    lineHeight: 1.6
                                }}
                            >
                                AI portrait generation will be available after its backend
                                integration. It is disabled for now to avoid unexpected
                                provider charges.
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading || mode === "generate"}
                            style={{
                                ...inputStyle,
                                background: "#5267e8",
                                cursor:
                                    loading || mode === "generate"
                                        ? "not-allowed"
                                        : "pointer",
                                fontWeight: 700,
                                padding: 15,
                                opacity:
                                    loading || mode === "generate" ? 0.6 : 1
                            }}
                        >
                            {loading
                                ? "Saving..."
                                : mode === "upload"
                                    ? "Save Uploaded Character"
                                    : "AI Generation Coming Soon"}
                        </button>

                        {message && (
                            <p
                                role="status"
                                style={{
                                    marginTop: 16,
                                    color: "#86efac"
                                }}
                            >
                                {message}
                            </p>
                        )}

                        {errorMessage && (
                            <p
                                role="alert"
                                style={{
                                    marginTop: 16,
                                    color: "#fca5a5",
                                    overflowWrap: "anywhere"
                                }}
                            >
                                {errorMessage}
                            </p>
                        )}
                    </form>

                    <section>
                        <h2
                            style={{
                                fontSize: 22,
                                fontWeight: 600,
                                marginBottom: 20
                            }}
                        >
                            Saved Characters
                        </h2>

                        {loadingData ? (
                            <div
                                style={{
                                    padding: 24,
                                    background: "#171e2c",
                                    borderRadius: 16,
                                    color: "#aeb9cd"
                                }}
                            >
                                Loading characters...
                            </div>
                        ) : characters.length === 0 ? (
                            <div
                                style={{
                                    padding: 24,
                                    background: "#171e2c",
                                    borderRadius: 16,
                                    color: "#aeb9cd"
                                }}
                            >
                                No characters saved yet.
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: 16 }}>
                                {characters.map((character) => (
                                    <article
                                        key={character.id}
                                        style={{
                                            display: "flex",
                                            gap: 16,
                                            background: "#171e2c",
                                            padding: 16,
                                            borderRadius: 14
                                        }}
                                    >
                                        {character.portrait_url ? (
                                            <img
                                                src={character.portrait_url}
                                                alt={character.name}
                                                style={{
                                                    width: 100,
                                                    height: 120,
                                                    objectFit: "cover",
                                                    borderRadius: 10,
                                                    flexShrink: 0
                                                }}
                                            />
                                        ) : (
                                            <div
                                                style={{
                                                    width: 100,
                                                    height: 120,
                                                    background: "#303b52",
                                                    borderRadius: 10,
                                                    flexShrink: 0
                                                }}
                                            />
                                        )}

                                        <div style={{ minWidth: 0 }}>
                                            <h3
                                                style={{
                                                    fontSize: 20,
                                                    fontWeight: 600,
                                                    marginBottom: 8
                                                }}
                                            >
                                                {character.name}
                                            </h3>

                                            <p
                                                style={{
                                                    color: "#aeb9cd",
                                                    marginBottom: 8,
                                                    overflowWrap: "anywhere"
                                                }}
                                            >
                                                {character.description}
                                            </p>

                                            <p style={{ color: "#b8c8ff" }}>
                                                Voice: {character.voice}
                                            </p>

                                            <p
                                                style={{
                                                    color: "#8f9db6",
                                                    fontSize: 12,
                                                    marginTop: 8
                                                }}
                                            >
                                                {character.portrait_source === "uploaded"
                                                    ? "Uploaded reference portrait"
                                                    : "AI-generated portrait"}
                                            </p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}

