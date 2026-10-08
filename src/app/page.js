"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const modes = {
  economy: {
    name: "Economy",
    description:
      "Faceless storytelling using images, motion and selected AI video.",
    baseCredits: 10,
  },
  standard: {
    name: "Standard",
    description:
      "More AI video scenes with cinematic motion and stronger visual detail.",
    baseCredits: 18,
  },
  cinematic: {
    name: "Cinematic",
    description: "Premium AI video generation for the highest visual quality.",
    baseCredits: 35,
  },
};

const durations = {
  30: 0.65,
  60: 1,
  90: 1.45,
};

const creditPacks = [
  { id: "starter", name: "Starter", credits: 25, price: "£4.99" },
  { id: "creator", name: "Creator", credits: 75, price: "£12.99" },
  { id: "studio", name: "Studio", credits: 200, price: "£29.99" },
];

function cleanEpisodeTitle(title, seriesTitle, episodeNumber) {
  if (!title) return `Episode ${episodeNumber}`;
  let cleaned = title.trim();

  if (seriesTitle) {
    const escapedSeries = seriesTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(
      new RegExp(`^${escapedSeries}\\s*[—–:\\-]*\\s*`, "i"),
      "",
    );
  }

  cleaned = cleaned.replace(
    new RegExp(`^Episode\\s*${episodeNumber}\\s*[—–:\\-]*\\s*`, "i"),
    "",
  );

  cleaned = cleaned
    .replace(/^["“”']+/, "")
    .replace(/["“”']+$/, "")
    .trim();

  return cleaned || `Episode ${episodeNumber}`;
}

function getNextEpisodeNumber(episodes) {
  if (!episodes?.length) return 1;
  return (
    Math.max(
      ...episodes.map((episode) => Number(episode.episode_number) || 0),
    ) + 1
  );
}

function episodeNumberExists(episodes, episodeNumber) {
  return episodes.some(
    (episode) => Number(episode.episode_number) === Number(episodeNumber),
  );
}

function buildContinuityPackage(episodes) {
  return [...(episodes || [])]
    .sort((a, b) => Number(a.episode_number) - Number(b.episode_number))
    .map((episode) => ({
      episode_number: episode.episode_number,
      title: episode.title || "",
      summary: episode.episode_summary || "",
      cliffhanger: episode.cliffhanger || "",
      source: episode.source || "dramaai",
      status: episode.status || "",
    }));
}

export default function Home() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [credits, setCredits] = useState(0);
  const [reservedCredits, setReservedCredits] = useState(0);
  const [seriesList, setSeriesList] = useState([]);
  const [activePage, setActivePage] = useState("dashboard");
  const [creationType, setCreationType] = useState("new");

  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [genre, setGenre] = useState("Relationship");
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState("economy");
  const [platform, setPlatform] = useState("TikTok");
  const [voice, setVoice] = useState("Female");

  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [seriesEpisodes, setSeriesEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingStory, setGeneratingStory] = useState(false);
  const [generatedEpisode, setGeneratedEpisode] = useState(null);
  const [storyModel, setStoryModel] = useState("");

  const [editingStory, setEditingStory] = useState(false);
  const [editableEpisode, setEditableEpisode] = useState(null);
  const [editNotice, setEditNotice] = useState("");

  const [productionJob, setProductionJob] = useState(null);
  const [productionLoading, setProductionLoading] = useState(false);
  const [productionNotice, setProductionNotice] = useState("");
  const [reservingCredits, setReservingCredits] = useState(false);

  const [sceneGenerating, setSceneGenerating] = useState(false);
  const [sceneAsset, setSceneAsset] = useState(null);
  const [sceneGenerationNotice, setSceneGenerationNotice] = useState("");

  const [fullProductionLoading, setFullProductionLoading] = useState(false);
  const [productionProgress, setProductionProgress] = useState(0);
  const [productionStage, setProductionStage] = useState("");
  const [productionAssets, setProductionAssets] = useState([]);
  const [fullProductionError, setFullProductionError] = useState("");
  const [completedVideoUrl, setCompletedVideoUrl] = useState("");

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryEpisodes, setLibraryEpisodes] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedLibraryEpisode, setSelectedLibraryEpisode] = useState(null);
  const [productionHistory, setProductionHistory] = useState([]);
  const [generationJobs, setGenerationJobs] = useState([]);
  const [generationJobsLoading, setGenerationJobsLoading] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingNotice, setBillingNotice] = useState("");
  const [creditPurchases, setCreditPurchases] = useState([]);
  const [purchaseHistoryLoading, setPurchaseHistoryLoading] = useState(false);

  const requiredCredits = useMemo(() => {
    return Math.ceil(modes[mode].baseCredits * durations[duration]);
  }, [mode, duration]);

  const displayedReservedCredits = useMemo(() => {
    if (
      ["reserved", "processing"].includes(productionJob?.status) &&
      productionJob?.credits_reserved > 0
    ) {
      return productionJob.credits_reserved;
    }
    return reservedCredits;
  }, [productionJob, reservedCredits]);

  const enoughCredits = credits >= requiredCredits;

  const selectedSeries = useMemo(() => {
    return seriesList.find((item) => item.id === selectedSeriesId) || null;
  }, [seriesList, selectedSeriesId]);

  const latestEpisode = useMemo(() => {
    if (!seriesEpisodes.length) return null;
    return [...seriesEpisodes].sort(
      (a, b) => Number(b.episode_number) - Number(a.episode_number),
    )[0];
  }, [seriesEpisodes]);

  const latestProductionReadyEpisode = useMemo(() => {
    if (!seriesEpisodes.length) return null;

    return (
      [...seriesEpisodes]
        .filter(
          (episode) =>
            ["storyboard_ready", "generating"].includes(episode.status) &&
            !episode.output_url,
        )
        .sort(
          (a, b) => Number(b.episode_number) - Number(a.episode_number),
        )[0] || null
    );
  }, [seriesEpisodes]);

  const selectedProductionEpisode = useMemo(() => {
    if (!productionJob?.episode_id) return null;
    return (
      seriesEpisodes.find(
        (episode) => episode.id === productionJob.episode_id,
      ) || null
    );
  }, [seriesEpisodes, productionJob]);

  const productionPanelEpisode =
    selectedProductionEpisode || latestProductionReadyEpisode;

  const nextEpisodeNumber = useMemo(() => {
    return getNextEpisodeNumber(seriesEpisodes);
  }, [seriesEpisodes]);

  const continuityPackage = useMemo(() => {
    return buildContinuityPackage(seriesEpisodes);
  }, [seriesEpisodes]);

  const storyboardDuration = useMemo(() => {
    if (!generatedEpisode?.scenes) return 0;
    return generatedEpisode.scenes.reduce(
      (total, scene) => total + Number(scene.duration_seconds || 0),
      0,
    );
  }, [generatedEpisode]);

  const editableStoryboardDuration = useMemo(() => {
    if (!editableEpisode?.scenes) return 0;
    return editableEpisode.scenes.reduce(
      (total, scene) => total + Number(scene.duration_seconds || 0),
      0,
    );
  }, [editableEpisode]);

  const completedLibraryEpisodes = useMemo(() => {
    return libraryEpisodes.filter(
      (episode) => episode.status === "completed" && episode.output_url,
    );
  }, [libraryEpisodes]);

  const libraryStats = useMemo(() => {
    const completed = libraryEpisodes.filter(
      (episode) => episode.status === "completed",
    ).length;

    const inProduction = libraryEpisodes.filter((episode) =>
      ["awaiting_credits", "generating"].includes(episode.status),
    ).length;

    const ready = libraryEpisodes.filter(
      (episode) => episode.status === "storyboard_ready",
    ).length;

    return {
      total: libraryEpisodes.length,
      completed,
      ready,
      inProduction,
    };
  }, [libraryEpisodes]);

  useEffect(() => {
    async function initialise() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);

      await Promise.all([
        loadProfile(currentUser.id),
        loadWallet(currentUser.id),
        loadSeries(currentUser.id),
      ]);

      setCheckingAuth(false);
    }

    initialise();
  }, [router, supabase]);

  useEffect(() => {
    if (creationType === "continue" && selectedSeriesId && user) {
      loadEpisodes(selectedSeriesId);
    } else {
      setSeriesEpisodes([]);
    }
  }, [creationType, selectedSeriesId, user]);

  useEffect(() => {
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const sessionId = params.get("session_id");

    if (payment === "cancelled") {
      setBillingNotice("Credit purchase cancelled. No payment was taken.");
      setBillingOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (payment !== "success" || !sessionId) return;

    let cancelled = false;

    async function confirmCheckout() {
      setBillingOpen(true);
      setBillingLoading(true);
      setBillingNotice("Payment received. Confirming your DramaAI credits...");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error(
            "Your login session has expired. Please sign in again.",
          );
        }

        let credited = false;

        for (let attempt = 0; attempt < 6; attempt += 1) {
          const response = await fetch("/api/billing/checkout-status", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ sessionId }),
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(
              result.message || "Could not confirm your credit purchase.",
            );
          }

          if (result.credited) {
            credited = true;
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        if (cancelled) return;

        await Promise.all([loadWallet(user.id), loadCreditPurchases(user.id)]);

        setBillingNotice(
          credited
            ? "Payment confirmed. Your DramaAI credits have been added."
            : "Payment is confirmed and your credits are still being applied. Refresh the wallet shortly.",
        );
      } catch (error) {
        if (!cancelled) {
          setBillingNotice(
            error?.message || "Could not confirm your credit purchase.",
          );
        }
      } finally {
        if (!cancelled) setBillingLoading(false);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    confirmCheckout();

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, display_name, role")
      .eq("id", userId)
      .single();

    if (!error && data) {
      setProfile(data);
    }
  }

  async function loadWallet(userId = user?.id) {
    if (!userId) return;

    const { data, error } = await supabase
      .from("credit_wallets")
      .select("available_credits, reserved_credits")
      .eq("user_id", userId)
      .single();

    if (!error && data) {
      setCredits(Number(data.available_credits) || 0);
      setReservedCredits(Number(data.reserved_credits) || 0);
    }
  }

  async function loadSeries(userId) {
    const { data, error } = await supabase
      .from("series")
      .select("id, title, description, genre, platform, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error) {
      setSeriesList(data || []);
    }
  }

  async function loadEpisodes(seriesId) {
    if (!user?.id || !seriesId) return;

    setLoadingEpisodes(true);

    const { data, error } = await supabase
      .from("episodes")
      .select(
        "id, series_id, episode_number, title, story_idea, script, storyboard, episode_summary, cliffhanger, source, duration_seconds, generation_mode, status, ai_model, story_generated_at, approved_at, output_url, thumbnail_url, production_completed_at, story_generation_count, production_generation_count, created_at",
      )
      .eq("series_id", seriesId)
      .eq("user_id", user.id)
      .order("episode_number", {
        ascending: true,
      });

    if (error) {
      setNotice(`Could not load episodes: ${error.message}`);
      setSeriesEpisodes([]);
    } else {
      setSeriesEpisodes(data || []);
    }

    setLoadingEpisodes(false);
  }

  async function loadSeriesContinuity(seriesId) {
    if (!seriesId) return;
    await loadEpisodes(seriesId);
  }

  async function loadCreatorLibrary(seriesId = null) {
    if (!user?.id) return;

    setLibraryLoading(true);

    try {
      let query = supabase
        .from("episodes")
        .select(
          `
          id,
          series_id,
          episode_number,
          title,
          episode_summary,
          cliffhanger,
          duration_seconds,
          generation_mode,
          status,
          output_url,
          thumbnail_url,
          production_completed_at,
          source,
          created_at,
          series (
            id,
            title,
            genre,
            platform
          )
          `,
        )
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (seriesId) {
        query = query.eq("series_id", seriesId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setLibraryEpisodes(data || []);
    } catch (error) {
      console.error("DramaAI library error:", error);
      setProductionNotice(
        error?.message || "Could not load your episode library.",
      );
    } finally {
      setLibraryLoading(false);
    }
  }

  async function loadEpisodeProductionHistory(episodeId) {
    if (!episodeId) {
      setProductionHistory([]);
      return [];
    }

    const { data, error } = await supabase
      .from("generation_jobs")
      .select(
        "id, episode_id, status, credits_required, credits_reserved, generation_type, current_stage, progress, output_url, created_at, completed_at",
      )
      .eq("episode_id", episodeId)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error("DramaAI production history error:", error);
      setProductionHistory([]);
      return [];
    }

    setProductionHistory(data || []);
    return data || [];
  }

  async function loadGenerationJobs() {
    if (!user?.id) return [];

    setGenerationJobsLoading(true);

    const { data, error } = await supabase
      .from("generation_jobs")
      .select(
        `
        id,
        user_id,
        episode_id,
        status,
        credits_required,
        credits_reserved,
        generation_type,
        current_stage,
        progress,
        output_url,
        created_at,
        completed_at,
        episodes (
          id,
          series_id,
          episode_number,
          title,
          status,
          generation_mode,
          duration_seconds,
          output_url,
          series (
            id,
            title
          )
        )
        `,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("DramaAI generations error:", error);
      setGenerationJobs([]);
      setGenerationJobsLoading(false);
      return [];
    }

    setGenerationJobs(data || []);
    setGenerationJobsLoading(false);
    return data || [];
  }

  async function createVideoVersion(job) {
    const episode = job?.episodes;

    if (!episode?.id || !episode?.series_id) return;

    setProductionNotice("");
    setFullProductionError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "Your login session has expired. Please sign in again.",
        );
      }

      const response = await fetch("/api/production/create-video-version", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ episodeId: episode.id }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Could not prepare the video version.",
        );
      }

      resetForm();
      setCreationType("continue");
      setSelectedSeriesId(episode.series_id);
      setMode("standard");
      setActivePage("create");
      setProductionJob(result.job);
      setProductionProgress(Number(result.job?.progress || 0));
      setProductionStage("Ready for Standard AI video production");
      setProductionNotice(
        result.existing
          ? "This Episode 2 video version already has an active production. No new job or charge was created."
          : `A new Standard AI video version is ready. Final cost: ${result.creditsRequired} credits. Your completed Economy video remains in Generations.`,
      );

      await Promise.all([
        loadEpisodes(episode.series_id),
        loadWallet(user?.id),
        loadGenerationJobs(),
        loadEpisodeProductionHistory(episode.id),
      ]);

      setTimeout(() => {
        document.getElementById("production-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
    } catch (error) {
      setProductionNotice(
        error?.message || "Could not prepare the video version.",
      );
    }
  }

  async function openGenerationJob(job) {
    const episode = job?.episodes;

    if (!episode?.series_id) return;

    resetForm();
    setCreationType("continue");
    setSelectedSeriesId(episode.series_id);
    setActivePage("create");
    setProductionJob(job);
    setProductionProgress(Number(job.progress || 0));
    setProductionStage(
      job.current_stage === "settlement_pending"
        ? "Final video ready — settlement pending"
        : (job.current_stage || "")
            .replace(/_/g, " ")
            .replace(/^./, (value) => value.toUpperCase()),
    );

    if (job.output_url) {
      setCompletedVideoUrl(job.output_url);
    }

    await loadEpisodes(episode.series_id);
    await loadEpisodeProductionHistory(episode.id);
  }

  async function loadCreditPurchases(userId = user?.id) {
    if (!userId) return [];

    setPurchaseHistoryLoading(true);

    const { data, error } = await supabase
      .from("credit_purchases")
      .select(
        "id, pack_id, credits, amount_pence, currency, status, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("DramaAI purchase history error:", error);
      setCreditPurchases([]);
      setPurchaseHistoryLoading(false);
      return [];
    }

    setCreditPurchases(data || []);
    setPurchaseHistoryLoading(false);
    return data || [];
  }

  async function openBilling() {
    setBillingOpen(true);
    setBillingNotice("");
    await loadCreditPurchases(user?.id);
  }

  async function buyCreditPack(packId) {
    setBillingLoading(true);
    setBillingNotice("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "Your login session has expired. Please sign in again.",
        );
      }

      const response = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ packId }),
      });

      const result = await response.json();

      if (!response.ok || !result.success || !result.checkoutUrl) {
        throw new Error(result.message || "Could not start Stripe Checkout.");
      }

      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setBillingNotice(error?.message || "Could not start checkout.");
      setBillingLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function resetForm() {
    setCreationType("new");
    setTitle("");
    setStory("");
    setGenre("Relationship");
    setDuration(60);
    setMode("economy");
    setPlatform("TikTok");
    setVoice("Female");
    setSelectedSeriesId("");
    setSeriesEpisodes([]);
    setGeneratedEpisode(null);
    setEditableEpisode(null);
    setEditingStory(false);
    setStoryModel("");
    setNotice("");
    setEditNotice("");
    setProductionJob(null);
    setProductionNotice("");
    setSceneAsset(null);
    setSceneGenerationNotice("");
    setProductionProgress(0);
    setProductionStage("");
    setProductionAssets([]);
    setFullProductionError("");
    setCompletedVideoUrl("");
    setProductionHistory([]);
  }

  function openCreatePage() {
    resetForm();
    setActivePage("create");
  }

  function openContinueSeries(seriesId) {
    resetForm();
    setCreationType("continue");
    setSelectedSeriesId(seriesId);
    setActivePage("create");
  }

  function openDashboard() {
    setNotice("");
    setGeneratedEpisode(null);
    setEditableEpisode(null);
    setEditingStory(false);
    setActivePage("dashboard");
  }

  async function handleGenerateStory() {
    setNotice("");
    setEditNotice("");
    setGeneratedEpisode(null);
    setEditableEpisode(null);
    setEditingStory(false);
    setStoryModel("");

    if (!selectedSeries) {
      setNotice("Please choose the series you want to continue.");
      return;
    }

    if (!latestEpisode) {
      setNotice(
        "This series does not have an existing episode to continue from.",
      );
      return;
    }

    if (episodeNumberExists(seriesEpisodes, nextEpisodeNumber)) {
      setNotice(
        `Episode ${nextEpisodeNumber} already exists. Refresh the series before generating another episode.`,
      );
      return;
    }

    setGeneratingStory(true);

    try {
      const response = await fetch("/api/generate-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seriesTitle: selectedSeries.title,
          genre: selectedSeries.genre,
          platform: selectedSeries.platform,
          episodeNumber: nextEpisodeNumber,
          duration,
          durationSeconds: duration,
          generationMode: mode,
          previousEpisode: latestEpisode,
          creatorDirection: story,
          storyIdea: story,
          continuity: continuityPackage,
          series: selectedSeries,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "DramaAI could not generate the story.",
        );
      }

      const cleanedEpisode = {
        ...result.episode,
        title: cleanEpisodeTitle(
          result.episode.title,
          selectedSeries.title,
          nextEpisodeNumber,
        ),
      };

      setGeneratedEpisode(cleanedEpisode);
      setStoryModel(result.model || "");

      setNotice(
        `Episode ${nextEpisodeNumber} story draft generated successfully. Review or edit it before saving.`,
      );

      setTimeout(() => {
        document.getElementById("story-preview")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
    } catch (error) {
      console.error(error);
      setNotice(
        error?.message ||
          "DramaAI could not generate this episode. Please try again.",
      );
    } finally {
      setGeneratingStory(false);
    }
  }

  function startEditingStory() {
    if (!generatedEpisode) return;

    setEditableEpisode(JSON.parse(JSON.stringify(generatedEpisode)));
    setEditingStory(true);
    setEditNotice("");

    setTimeout(() => {
      document.getElementById("story-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  function cancelEditingStory() {
    setEditableEpisode(null);
    setEditingStory(false);
    setEditNotice("");
  }

  function updateEditableField(field, value) {
    setEditableEpisode((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateContinuityNote(index, value) {
    setEditableEpisode((current) => {
      const notes = [...(current.continuity_notes || [])];

      notes[index] = value;

      return {
        ...current,
        continuity_notes: notes,
      };
    });
  }

  function addContinuityNote() {
    setEditableEpisode((current) => ({
      ...current,
      continuity_notes: [...(current.continuity_notes || []), ""],
    }));
  }

  function removeContinuityNote(index) {
    setEditableEpisode((current) => ({
      ...current,
      continuity_notes: current.continuity_notes.filter(
        (_, noteIndex) => noteIndex !== index,
      ),
    }));
  }

  function updateScene(index, field, value) {
    setEditableEpisode((current) => {
      const scenes = current.scenes.map((scene, sceneIndex) => {
        if (sceneIndex !== index) {
          return scene;
        }

        return {
          ...scene,
          [field]: field === "duration_seconds" ? Number(value) : value,
        };
      });

      return {
        ...current,
        scenes,
      };
    });
  }

  function addScene() {
    setEditableEpisode((current) => {
      const scenes = [...(current.scenes || [])];

      const nextSceneNumber =
        scenes.length > 0
          ? Math.max(
              ...scenes.map((scene) => Number(scene.scene_number) || 0),
            ) + 1
          : 1;

      scenes.push({
        scene_number: nextSceneNumber,
        duration_seconds: 5,
        narration: "",
        dialogue: "",
        caption: "",
        visual_prompt: "",
        camera_direction: "",
        sound_direction: "",
      });

      return {
        ...current,
        scenes,
      };
    });
  }

  function removeScene(index) {
    setEditableEpisode((current) => {
      const scenes = current.scenes
        .filter((_, sceneIndex) => sceneIndex !== index)
        .map((scene, sceneIndex) => ({
          ...scene,
          scene_number: sceneIndex + 1,
        }));

      return {
        ...current,
        scenes,
      };
    });
  }

  function saveStoryEdits() {
    if (!editableEpisode) return;

    if (!editableEpisode.title?.trim()) {
      setEditNotice("The episode needs a title.");
      return;
    }

    if (!editableEpisode.hook?.trim()) {
      setEditNotice("The episode needs an opening hook.");
      return;
    }

    if (!editableEpisode.episode_summary?.trim()) {
      setEditNotice("The episode needs a summary.");
      return;
    }

    if (!editableEpisode.script?.trim()) {
      setEditNotice("The episode needs a script.");
      return;
    }

    if (!editableEpisode.cliffhanger?.trim()) {
      setEditNotice("The episode needs a cliffhanger.");
      return;
    }

    if (!editableEpisode.scenes?.length) {
      setEditNotice("The storyboard needs at least one scene.");
      return;
    }

    const invalidDuration = editableEpisode.scenes.some(
      (scene) =>
        !Number.isFinite(Number(scene.duration_seconds)) ||
        Number(scene.duration_seconds) <= 0,
    );

    if (invalidDuration) {
      setEditNotice("Every scene must have a duration greater than zero.");
      return;
    }

    const cleaned = {
      ...editableEpisode,
      title: cleanEpisodeTitle(
        editableEpisode.title,
        selectedSeries?.title,
        nextEpisodeNumber,
      ),
      continuity_notes: (editableEpisode.continuity_notes || [])
        .map((note) => note.trim())
        .filter(Boolean),
    };

    setGeneratedEpisode(cleaned);
    setEditableEpisode(null);
    setEditingStory(false);
    setEditNotice("");

    setNotice(
      "Your story changes have been applied. No new AI request was made.",
    );

    setTimeout(() => {
      document.getElementById("story-preview")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  async function prepareProduction() {
    if (!latestProductionReadyEpisode) {
      setProductionNotice(
        "There is no approved episode waiting for production.",
      );
      return;
    }

    setProductionLoading(true);
    setProductionNotice("");
    setFullProductionError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "Your login session has expired. Please sign in again.",
        );
      }

      const response = await fetch("/api/production/create-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          episodeId: latestProductionReadyEpisode.id,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Could not prepare this episode for production.",
        );
      }

      setProductionJob(result.job);
      setProductionProgress(Number(result.job?.progress || 0));
      setProductionStage(
        result.job?.current_stage === "settlement_pending"
          ? "Final video ready — settlement pending"
          : (result.job?.current_stage || "")
              .replace(/_/g, " ")
              .replace(/^./, (value) => value.toUpperCase()),
      );
      setProductionNotice(
        result.existing
          ? `Episode ${latestProductionReadyEpisode.episode_number} has an existing ${result.job.status} production. No new job or charge was created.`
          : `Episode ${latestProductionReadyEpisode.episode_number} is ready for production. Final cost: ${result.creditsRequired} credits.`,
      );

      await loadWallet(user?.id);
      await loadEpisodeProductionHistory(latestProductionReadyEpisode.id);

      setTimeout(() => {
        document.getElementById("production-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (error) {
      setProductionNotice(error?.message || "Could not prepare production.");
    } finally {
      setProductionLoading(false);
    }
  }

  async function confirmProduction() {
    if (!productionJob?.id) {
      setProductionNotice(
        "The production job is missing. Please prepare production again.",
      );
      return;
    }

    setReservingCredits(true);
    setProductionNotice("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "Your login session has expired. Please sign in again.",
        );
      }

      const response = await fetch("/api/production/reserve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          jobId: productionJob.id,
        }),
      });

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          "The credit reservation service could not be reached. Please check the API route and try again.",
        );
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Could not reserve the production credits.",
        );
      }

      const reservedAmount =
        Number(result.job?.credits_reserved) ||
        Number(productionJob.credits_required) ||
        0;

      setProductionJob((current) => ({
        ...current,
        ...(result.job || {}),
        status: "reserved",
        credits_reserved: reservedAmount,
      }));

      await loadWallet(user?.id);

      if (productionJob?.episode_id) {
        await loadEpisodeProductionHistory(productionJob.episode_id);
      }

      setProductionNotice(
        `${reservedAmount} credits have been reserved. Your episode is ready for production.`,
      );
    } catch (error) {
      setProductionNotice(
        error?.message || "Could not reserve production credits.",
      );
    } finally {
      setReservingCredits(false);
    }
  }

  async function generateTestScene() {
    if (
      !productionJob?.id ||
      !["reserved", "processing"].includes(productionJob.status)
    ) {
      setSceneGenerationNotice("Production credits must be reserved first.");
      return;
    }

    setSceneGenerating(true);
    setSceneGenerationNotice("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "Your login session has expired. Please sign in again.",
        );
      }

      const response = await fetch("/api/production/generate-scene", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          jobId: productionJob.id,
          sceneNumber: 1,
        }),
      });

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error("The scene-generation service could not be reached.");
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Scene generation failed.");
      }

      setSceneAsset(result.asset);
      setSceneGenerationNotice(
        result.existing
          ? "Scene 1 already exists. The saved image has been loaded."
          : "Scene 1 visual generated successfully.",
      );
    } catch (error) {
      setSceneGenerationNotice(error?.message || "Scene generation failed.");
    } finally {
      setSceneGenerating(false);
    }
  }

  async function startFullProduction() {
    if (!productionJob?.id) {
      setFullProductionError("Production job is missing.");
      return;
    }

    if (!["reserved", "processing"].includes(productionJob.status)) {
      setFullProductionError(
        "Production credits must be reserved before generation can begin.",
      );
      return;
    }

    const productionEpisode =
      seriesEpisodes.find(
        (episode) => episode.id === productionJob.episode_id,
      ) ||
      latestProductionReadyEpisode ||
      null;

    if (!productionEpisode) {
      setFullProductionError(
        "The episode for this production job could not be found.",
      );
      return;
    }

    setFullProductionLoading(true);
    setFullProductionError("");
    setProductionProgress(1);
    setProductionStage("Preparing production");
    setCompletedVideoUrl("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "Your login session has expired. Please sign in again.",
        );
      }

      const requestProductionStage = async (url) => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            jobId: productionJob.id,
          }),
        });

        const contentType = response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
          throw new Error(
            "The production service returned an invalid response.",
          );
        }

        const result = await response.json();

        if (!response.ok || !result.success) {
          const productionError = new Error(
            result.message || "Production failed.",
          );

          productionError.settlementPending = Boolean(result.settlementPending);

          throw productionError;
        }

        return result;
      };

      setProductionStage("Generating scene visuals");

      const visualResult = await requestProductionStage(
        "/api/production/generate-visuals",
      );

      setProductionAssets(visualResult.assets || []);
      setProductionProgress(45);

      setProductionJob((current) => ({
        ...current,
        status: "processing",
        current_stage: "scene_visuals",
        progress: 45,
      }));

      const shouldGenerateAiVideo =
        productionJob?.provider === "runway" ||
        productionJob?.generation_type === "regeneration" ||
        ["standard", "cinematic"].includes(productionEpisode?.generation_mode);

      if (shouldGenerateAiVideo) {
        setProductionStage("Generating AI video scenes");

        const videoResult = await requestProductionStage(
          "/api/production/generate-videos",
        );

        if (videoResult.assets?.length) {
          setProductionAssets((current) => {
            const combined = [...current, ...videoResult.assets];

            const unique = new Map();

            combined.forEach((asset) => {
              const key =
                asset.id ||
                `${asset.asset_type}-${asset.scene_number}-${asset.public_url}`;

              unique.set(key, asset);
            });

            return [...unique.values()];
          });
        }

        setProductionProgress(60);

        setProductionJob((current) => ({
          ...current,
          status: "processing",
          current_stage: "video_complete",
          progress: 60,
        }));
      }

      setProductionStage("Generating narration and dialogue");

      const audioResult = await requestProductionStage(
        "/api/production/generate-audio",
      );

      if (audioResult.assets?.length) {
        setProductionAssets((current) => {
          const combined = [...current, ...audioResult.assets];

          const unique = new Map();

          combined.forEach((asset) => {
            const key =
              asset.id ||
              `${asset.asset_type}-${asset.scene_number}-${asset.public_url}`;

            unique.set(key, asset);
          });

          return [...unique.values()];
        });
      }

      setProductionProgress(65);

      setProductionJob((current) => ({
        ...current,
        status: "processing",
        current_stage: "audio",
        progress: 65,
      }));

      setProductionStage("Creating cinematic motion, captions and final video");

      const renderResult = await requestProductionStage(
        "/api/production/render",
      );

      setProductionProgress(100);
      setCompletedVideoUrl(renderResult.outputUrl || "");
      setProductionStage("Episode complete");

      setProductionJob((current) => ({
        ...current,
        status: "completed",
        progress: 100,
        current_stage: "completed",
        output_url: renderResult.outputUrl,
        credits_reserved: 0,
      }));

      setReservedCredits(0);

      setProductionNotice(
        `Episode ${productionEpisode.episode_number} has been produced successfully.`,
      );

      await loadWallet(user?.id);

      if (selectedSeriesId) {
        await loadSeriesContinuity(selectedSeriesId);
      }

      await loadCreatorLibrary();
      await loadGenerationJobs();
      await loadEpisodeProductionHistory(productionEpisode.id);
    } catch (error) {
      console.error("DramaAI production error:", error);

      setFullProductionError(
        error?.message || "DramaAI could not complete this production.",
      );

      setProductionStage(
        error?.settlementPending
          ? "Production cost incurred — settlement pending"
          : "Production stopped",
      );

      if (error?.settlementPending) {
        setProductionNotice(
          "AI production had already started. Credits remain reserved while the production is safely recovered or settled.",
        );
      }

      await loadWallet(user?.id);
      await loadGenerationJobs();

      if (productionEpisode?.id) {
        await loadEpisodeProductionHistory(productionEpisode.id);
      }
    } finally {
      setFullProductionLoading(false);
    }
  }

  async function handleCreateDrama() {
    setNotice("");

    if (!user) {
      router.replace("/login");
      return;
    }

    if (creationType === "new") {
      await createNewSeries();
      return;
    }

    await createNextEpisode();
  }

  async function createNewSeries() {
    if (!title.trim() || !story.trim()) {
      setNotice("Please enter a series title and story idea.");
      return;
    }

    if (title.trim().length > 120) {
      setNotice("Please keep the series title under 120 characters.");
      return;
    }

    setSaving(true);

    try {
      const { data: newSeries, error: seriesError } = await supabase
        .from("series")
        .insert({
          user_id: user.id,
          title: title.trim(),
          description: story.trim(),
          genre,
          platform,
          status: "draft",
        })
        .select()
        .single();

      if (seriesError) {
        throw new Error(`Could not create series: ${seriesError.message}`);
      }

      const { error: episodeError } = await supabase.from("episodes").insert({
        series_id: newSeries.id,
        user_id: user.id,
        episode_number: 1,
        title: "Episode 1",
        story_idea: story.trim(),
        duration_seconds: duration,
        generation_mode: mode,
        status: "draft",
        source: "dramaai",
        story_generation_count: 0,
        production_generation_count: 0,
      });

      if (episodeError) {
        await supabase.from("series").delete().eq("id", newSeries.id);
        throw new Error(`Could not create Episode 1: ${episodeError.message}`);
      }

      await loadSeries(user.id);
      resetForm();
      setActivePage("dashboard");
    } catch (error) {
      setNotice(error?.message || "Could not create your new series.");
    } finally {
      setSaving(false);
    }
  }

  async function createNextEpisode() {
    setNotice("");

    if (!selectedSeriesId || !selectedSeries) {
      setNotice("Please choose the series you want to continue.");
      return;
    }

    if (!latestEpisode) {
      setNotice("This series does not have an existing episode yet.");
      return;
    }

    if (!generatedEpisode) {
      setNotice("Generate and review the episode story before approving it.");
      return;
    }

    if (editingStory) {
      setNotice(
        "Save or cancel your story edits before approving the episode.",
      );
      return;
    }

    if (episodeNumberExists(seriesEpisodes, nextEpisodeNumber)) {
      setNotice(
        `Episode ${nextEpisodeNumber} already exists. Refresh the series before creating another episode.`,
      );
      return;
    }

    const totalSceneDuration = (generatedEpisode.scenes || []).reduce(
      (total, scene) => total + Number(scene.duration_seconds || 0),
      0,
    );

    if (totalSceneDuration !== Number(duration)) {
      setNotice(
        `The storyboard currently totals ${totalSceneDuration} seconds. It must total exactly ${duration} seconds before approval.`,
      );
      return;
    }

    setSaving(true);

    try {
      const storyboard = {
        hook: generatedEpisode.hook || "",
        continuity_notes: generatedEpisode.continuity_notes || [],
        scenes: generatedEpisode.scenes || [],
      };

      const { data, error } = await supabase
        .from("episodes")
        .insert({
          series_id: selectedSeriesId,
          user_id: user.id,
          episode_number: nextEpisodeNumber,
          title: cleanEpisodeTitle(
            generatedEpisode.title,
            selectedSeries.title,
            nextEpisodeNumber,
          ),
          story_idea: story.trim() || null,
          script: generatedEpisode.script,
          storyboard,
          episode_summary: generatedEpisode.episode_summary,
          cliffhanger: generatedEpisode.cliffhanger,
          duration_seconds: duration,
          generation_mode: mode,
          status: "storyboard_ready",
          source: "dramaai",
          ai_model: storyModel || null,
          story_generated_at: new Date().toISOString(),
          approved_at: new Date().toISOString(),
          story_generation_count: 1,
          production_generation_count: 0,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Could not save the episode: ${error.message}`);
      }

      await supabase
        .from("series")
        .update({
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedSeriesId)
        .eq("user_id", user.id);

      await loadSeries(user.id);
      await loadEpisodes(selectedSeriesId);

      setGeneratedEpisode(null);
      setEditableEpisode(null);
      setEditingStory(false);
      setStory("");
      setProductionJob(null);
      setProductionProgress(0);
      setProductionStage("");
      setProductionAssets([]);
      setCompletedVideoUrl("");
      setFullProductionError("");

      setNotice(
        `Episode ${data.episode_number} has been approved and saved. Video production has not started yet.`,
      );

      setTimeout(() => {
        document.getElementById("production-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
    } catch (error) {
      setNotice(error?.message || "Could not approve this episode.");
    } finally {
      setSaving(false);
    }
  }

  function selectLibraryEpisode(episode) {
    setSelectedLibraryEpisode(episode);
    loadEpisodeProductionHistory(episode.id);
  }

  function continueFromLibraryEpisode(episode) {
    if (!episode?.series_id) return;

    setSelectedLibraryEpisode(null);
    setLibraryOpen(false);
    resetForm();
    setCreationType("continue");
    setSelectedSeriesId(episode.series_id);
    setActivePage("create");
  }

  if (checkingAuth) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">D</div>
        <h2>DramaAI Studio</h2>
        <p>Loading your creator workspace...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-mark">D</div>
            <div>
              <strong>DramaAI</strong>
              <span>Studio</span>
            </div>
          </div>

          <nav>
            <button
              type="button"
              className={activePage === "dashboard" ? "nav-active" : ""}
              onClick={openDashboard}
            >
              <span>⌂</span>
              Dashboard
            </button>

            <button
              type="button"
              className={activePage === "create" ? "nav-active" : ""}
              onClick={openCreatePage}
            >
              <span>＋</span>
              Create Drama
            </button>

            <button
              type="button"
              onClick={async () => {
                setLibraryOpen(true);
                setActivePage("library");
                await loadCreatorLibrary();
              }}
              className={activePage === "library" ? "nav-active" : ""}
            >
              <span>▶</span>
              My Series
            </button>

            <button
              type="button"
              className={activePage === "generations" ? "nav-active" : ""}
              onClick={async () => {
                setLibraryOpen(false);
                setSelectedLibraryEpisode(null);
                setActivePage("generations");
                await loadGenerationJobs();
              }}
            >
              <span>▣</span>
              Generations
            </button>

            <button type="button" onClick={openBilling}>
              <span>◈</span>
              Credits
            </button>

            {profile?.role === "admin" && (
              <button type="button" onClick={() => router.push("/admin")}>
                <span>◆</span>
                Admin
              </button>
            )}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="library-button"
            onClick={async () => {
              setLibraryOpen(true);
              setActivePage("library");
              await loadCreatorLibrary();
            }}
          >
            Creator Library
          </button>

          <div className="profile">
            <div className="avatar">
              {(profile?.display_name || user?.email || "C")
                .charAt(0)
                .toUpperCase()}
            </div>
            <div className="profile-details">
              <strong>{profile?.display_name || "Creator"}</strong>
              <span>{profile?.role || "creator"}</span>
            </div>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>
              {activePage === "dashboard"
                ? "Creator Dashboard"
                : activePage === "library"
                  ? "Creator Library"
                  : activePage === "generations"
                    ? "Generations"
                    : "Create AI Drama"}
            </h1>
            <p>
              {activePage === "dashboard"
                ? "Create, continue and produce episodic AI drama."
                : activePage === "library"
                  ? "Review your episodes and completed productions."
                  : activePage === "generations"
                    ? "Track, resume and review your AI production jobs."
                    : "Build the next episode while preserving story continuity."}
            </p>
          </div>

          <div className="top-actions">
            <div className="credit-pill">
              <span>✦</span>
              <div>
                <small>Available balance</small>
                <strong>{credits} credits</strong>
              </div>
            </div>

            {displayedReservedCredits > 0 && (
              <div className="credit-pill reserved-credit-pill">
                <span>◈</span>
                <div>
                  <small>Reserved</small>
                  <strong>{displayedReservedCredits} credits</strong>
                </div>
              </div>
            )}

            <button type="button" className="buy-button" onClick={openBilling}>
              Buy Credits
            </button>
          </div>
        </header>

        {activePage === "dashboard" && (
          <>
            <section className="hero">
              <div>
                <span className="eyebrow">AI SHORT DRAMA STUDIO</span>
                <h2>Turn one story idea into an episodic drama series.</h2>
                <p>
                  Create vertical short-form episodes with story continuity,
                  cinematic visuals, narration, captions and production controls
                  designed for TikTok, Reels and Shorts.
                </p>
                <button type="button" onClick={openCreatePage}>
                  Create New Drama
                </button>
              </div>

              <div className="hero-visual">
                <div className="phone">
                  <div className="phone-screen">
                    <span>DRAMAAI ORIGINAL</span>
                    <div className="phone-story">
                      <small>EPISODE 02</small>
                      <strong>The Secret Between Us</strong>
                    </div>
                    <small>9:16 AI DRAMA</small>
                  </div>
                </div>
              </div>
            </section>

            <section className="stats">
              <article>
                <span>Available Credits</span>
                <strong>{credits}</strong>
                <small>Ready for production</small>
              </article>

              <article>
                <span>Reserved Credits</span>
                <strong>{reservedCredits}</strong>
                <small>Held for active productions</small>
              </article>

              <article>
                <span>Series</span>
                <strong>{seriesList.length}</strong>
                <small>Your DramaAI projects</small>
              </article>

              <article>
                <span>Completed Videos</span>
                <strong>{completedLibraryEpisodes.length}</strong>
                <small>Finished DramaAI episodes</small>
              </article>
            </section>

            <section className="workspace">
              <div className="workspace-heading">
                <div>
                  <h2>Your Series</h2>
                  <p>Continue an existing story or start something new.</p>
                </div>

                <button type="button" onClick={openCreatePage}>
                  New Series
                </button>
              </div>

              {seriesList.length === 0 ? (
                <div className="empty-state">
                  <div>＋</div>
                  <h3>Create your first AI drama</h3>
                  <p>
                    Start with a story idea and DramaAI will help you develop it
                    into an episodic short-form series.
                  </p>
                  <button type="button" onClick={openCreatePage}>
                    Create Drama
                  </button>
                </div>
              ) : (
                <div className="series-grid">
                  {seriesList.map((item, index) => (
                    <article className="series-card" key={item.id}>
                      <div
                        className={`series-cover series-cover-${(index % 3) + 1}`}
                      >
                        <span>{item.genre || "Drama"}</span>
                        <strong>{item.title}</strong>
                      </div>

                      <div className="series-card-body">
                        <span className="series-status">
                          {item.status || "draft"}
                        </span>
                        <h3>{item.title}</h3>
                        <p>
                          {item.description ||
                            "Continue building your DramaAI series."}
                        </p>
                        <button
                          type="button"
                          onClick={() => openContinueSeries(item.id)}
                        >
                          Continue Series
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activePage === "create" && (
          <div className="creator-layout">
            <section className="creator-card">
              <div className="section-heading">
                <span>01</span>
                <div>
                  <h2>Choose what you want to create</h2>
                  <p>
                    Start a completely new drama or continue one of your
                    existing series.
                  </p>
                </div>
              </div>

              <div className="creation-choice-grid">
                <button
                  type="button"
                  className={`creation-choice ${
                    creationType === "new" ? "selected" : ""
                  }`}
                  onClick={() => {
                    setCreationType("new");
                    setSelectedSeriesId("");
                    setSeriesEpisodes([]);
                    setGeneratedEpisode(null);
                    setEditableEpisode(null);
                    setEditingStory(false);
                  }}
                >
                  <span>＋</span>
                  <div>
                    <strong>New Series</strong>
                    <p>Start a completely new drama from Episode 1.</p>
                  </div>
                </button>

                <button
                  type="button"
                  className={`creation-choice ${
                    creationType === "continue" ? "selected" : ""
                  }`}
                  onClick={() => {
                    setCreationType("continue");
                    setGeneratedEpisode(null);
                    setEditableEpisode(null);
                    setEditingStory(false);
                  }}
                >
                  <span>▶</span>
                  <div>
                    <strong>Continue Series</strong>
                    <p>Create the next episode of an existing story.</p>
                  </div>
                </button>
              </div>

              {creationType === "new" ? (
                <>
                  <div className="section-heading smaller">
                    <span>02</span>
                    <div>
                      <h2>Tell DramaAI your story</h2>
                      <p>
                        Give your series a title and describe the drama you want
                        to create.
                      </p>
                    </div>
                  </div>

                  <label>
                    Series title
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Example: The Secret Between Us"
                      maxLength={120}
                    />
                  </label>

                  <label>
                    Story idea
                    <textarea
                      value={story}
                      onChange={(event) => setStory(event.target.value)}
                      placeholder="Describe the characters, conflict, setting and mystery..."
                    />
                  </label>

                  <div className="two-columns">
                    <label>
                      Genre
                      <select
                        value={genre}
                        onChange={(event) => setGenre(event.target.value)}
                      >
                        <option>Relationship</option>
                        <option>Family</option>
                        <option>Crime</option>
                        <option>Mystery</option>
                        <option>Thriller</option>
                        <option>Romance</option>
                        <option>Comedy</option>
                      </select>
                    </label>

                    <label>
                      Platform
                      <select
                        value={platform}
                        onChange={(event) => setPlatform(event.target.value)}
                      >
                        <option>TikTok</option>
                        <option>Instagram Reels</option>
                        <option>YouTube Shorts</option>
                      </select>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div className="section-heading smaller">
                    <span>02</span>
                    <div>
                      <h2>Continue your story</h2>
                      <p>
                        DramaAI uses your previous episodes to maintain story
                        continuity.
                      </p>
                    </div>
                  </div>

                  <label>
                    Choose series
                    <select
                      value={selectedSeriesId}
                      onChange={(event) => {
                        setSelectedSeriesId(event.target.value);
                        setGeneratedEpisode(null);
                        setEditableEpisode(null);
                        setEditingStory(false);
                        setProductionJob(null);
                        setProductionNotice("");
                      }}
                    >
                      <option value="">Select a series</option>
                      {seriesList.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  {loadingEpisodes && (
                    <div className="continuity-card">
                      Loading series continuity...
                    </div>
                  )}

                  {!loadingEpisodes && selectedSeries && latestEpisode && (
                    <div className="continuity-card">
                      <div className="continuity-top">
                        <div>
                          <span>SELECTED SERIES</span>
                          <h3>{selectedSeries.title}</h3>
                        </div>
                        <strong>Next: Episode {nextEpisodeNumber}</strong>
                      </div>

                      <div className="continuity-meta">
                        <div>
                          <span>Previous episode</span>
                          <strong>
                            Episode {latestEpisode.episode_number}
                          </strong>
                        </div>
                        <div>
                          <span>Source</span>
                          <strong>
                            {latestEpisode.source === "external"
                              ? "Imported / Existing"
                              : "DramaAI"}
                          </strong>
                        </div>
                      </div>

                      <div className="continuity-content">
                        <span>Previous summary</span>
                        <p>
                          {latestEpisode.episode_summary ||
                            "No summary has been saved for this episode."}
                        </p>
                      </div>

                      <div className="continuity-content">
                        <span>Previous cliffhanger</span>
                        <p>
                          {latestEpisode.cliffhanger ||
                            "No cliffhanger has been saved."}
                        </p>
                      </div>
                    </div>
                  )}

                  <label>
                    What should happen next?
                    <textarea
                      value={story}
                      onChange={(event) => setStory(event.target.value)}
                      placeholder="Optional. Leave this blank and DramaAI will continue naturally from the previous cliffhanger."
                    />
                  </label>
                </>
              )}

              <div className="section-heading smaller">
                <span>03</span>
                <div>
                  <h2>Episode settings</h2>
                  <p>Choose duration and production quality.</p>
                </div>
              </div>

              <span className="field-title">Duration</span>

              <div className="choice-row">
                {[30, 60, 90].map((seconds) => (
                  <button
                    type="button"
                    key={seconds}
                    className={`choice ${
                      duration === seconds ? "selected" : ""
                    }`}
                    onClick={() => setDuration(seconds)}
                  >
                    <strong>{seconds}</strong>
                    <span>seconds</span>
                  </button>
                ))}
              </div>

              <span className="field-title">Generation mode</span>

              <div className="mode-grid">
                {Object.entries(modes).map(([key, item]) => (
                  <button
                    type="button"
                    key={key}
                    className={`mode ${mode === key ? "selected" : ""}`}
                    onClick={() => setMode(key)}
                  >
                    <div className="mode-top">
                      <strong>{item.name}</strong>
                      {key === "economy" && <span>Best value</span>}
                    </div>
                    <p>{item.description}</p>
                    <small>Estimate {item.baseCredits} credits</small>
                  </button>
                ))}
              </div>

              <div className="two-columns">
                <label>
                  Narrator
                  <select
                    value={voice}
                    onChange={(event) => setVoice(event.target.value)}
                  >
                    <option>Female</option>
                    <option>Male</option>
                  </select>
                </label>

                <label>
                  Format
                  <select value="9:16 Vertical" disabled>
                    <option>9:16 Vertical</option>
                  </select>
                </label>
              </div>

              {notice && <div className="notice">{notice}</div>}
            </section>

            <aside className="estimate-card">
              <div className="estimate-icon">✦</div>

              <h2>
                {creationType === "continue"
                  ? `Episode ${nextEpisodeNumber}`
                  : "New Drama"}
              </h2>

              <p>
                {creationType === "continue" && selectedSeries
                  ? `Continue ${selectedSeries.title} while preserving story continuity.`
                  : "Create a new episodic AI drama series."}
              </p>

              <div className="estimate-lines">
                <div>
                  <span>Series</span>
                  <strong>
                    {creationType === "continue"
                      ? selectedSeries?.title || "Not selected"
                      : title || "New series"}
                  </strong>
                </div>

                <div>
                  <span>Duration</span>
                  <strong>{duration} seconds</strong>
                </div>

                <div>
                  <span>Mode</span>
                  <strong>{modes[mode].name}</strong>
                </div>

                <div>
                  <span>Platform</span>
                  <strong>
                    {creationType === "continue"
                      ? selectedSeries?.platform || platform
                      : platform}
                  </strong>
                </div>

                <div>
                  <span>Format</span>
                  <strong>9:16</strong>
                </div>
              </div>

              <div className="estimate-total">
                <span>Video production estimate</span>
                <strong>{requiredCredits} credits</strong>
              </div>

              <div className={enoughCredits ? "balance-ok" : "balance-warning"}>
                <span>Your balance</span>
                <strong>{credits} credits</strong>
              </div>

              {creationType === "continue" ? (
                <button
                  type="button"
                  className="generate-button"
                  onClick={handleGenerateStory}
                  disabled={
                    generatingStory || !selectedSeries || !latestEpisode
                  }
                >
                  {generatingStory
                    ? "Generating Story..."
                    : `Generate Episode ${nextEpisodeNumber} Story`}
                </button>
              ) : (
                <button
                  type="button"
                  className="generate-button"
                  onClick={handleCreateDrama}
                  disabled={saving || !title.trim() || !story.trim()}
                >
                  {saving ? "Creating..." : "Create Series"}
                </button>
              )}

              <small className="estimate-note">
                Story creation does not deduct the video-production credits
                shown above. Paid visual production is approved separately.
              </small>
            </aside>
          </div>
        )}

        {generatedEpisode && activePage === "create" && (
          <section className="story-preview" id="story-preview">
            <div className="story-preview-heading">
              <div>
                <span className="section-label">AI STORY DRAFT</span>
                <h2>
                  Episode {nextEpisodeNumber} — {generatedEpisode.title}
                </h2>
                <p>
                  Review the complete episode before approving it for your
                  series.
                </p>
              </div>

              <div className="story-preview-badges">
                <span>No video credits charged</span>
                {storyModel && <span>{storyModel}</span>}
              </div>
            </div>

            <div className="story-section">
              <span>OPENING HOOK</span>
              <p>{generatedEpisode.hook}</p>
            </div>

            <div className="story-section">
              <span>EPISODE SUMMARY</span>
              <p>{generatedEpisode.episode_summary}</p>
            </div>

            <div className="story-section">
              <span>FULL SCRIPT</span>
              <p className="story-script">{generatedEpisode.script}</p>
            </div>

            <div className="story-section">
              <span>CLIFFHANGER</span>
              <p>{generatedEpisode.cliffhanger}</p>
            </div>

            {generatedEpisode.continuity_notes?.length > 0 && (
              <div className="story-section">
                <span>CONTINUITY NOTES</span>

                <div className="continuity-notes">
                  {generatedEpisode.continuity_notes.map((item, index) => (
                    <div key={`${item}-${index}`}>
                      <strong>{index + 1}</strong>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="storyboard-heading">
              <div>
                <span className="section-label">STORYBOARD</span>
                <h3>Episode scenes</h3>
              </div>

              <div
                className={
                  storyboardDuration === duration
                    ? "duration-match"
                    : "duration-warning"
                }
              >
                {storyboardDuration} / {duration} seconds
              </div>
            </div>

            <div className="storyboard-grid">
              {(generatedEpisode.scenes || []).map((scene, index) => (
                <article
                  className="scene-card"
                  key={`${scene.scene_number}-${index}`}
                >
                  <div className="scene-card-top">
                    <span>Scene {scene.scene_number || index + 1}</span>
                    <strong>{scene.duration_seconds}s</strong>
                  </div>

                  <div className="scene-detail">
                    <span>Narration</span>
                    <p>{scene.narration || "No narration"}</p>
                  </div>

                  <div className="scene-detail">
                    <span>Dialogue</span>
                    <p>
                      {typeof scene.dialogue === "string"
                        ? scene.dialogue || "No dialogue"
                        : JSON.stringify(scene.dialogue) || "No dialogue"}
                    </p>
                  </div>

                  <div className="scene-detail">
                    <span>Caption</span>
                    <p>{scene.caption || "No caption"}</p>
                  </div>

                  <div className="scene-detail">
                    <span>Visual</span>
                    <p>{scene.visual_prompt || "No visual prompt"}</p>
                  </div>

                  <div className="scene-detail">
                    <span>Camera</span>
                    <p>{scene.camera_direction || "Not specified"}</p>
                  </div>

                  <div className="scene-detail">
                    <span>Sound</span>
                    <p>{scene.sound_direction || "Not specified"}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="story-approval">
              <div>
                <strong>Happy with this episode?</strong>
                <p>
                  Approving saves the story and storyboard. It does not start
                  paid video production.
                </p>
              </div>

              <div className="story-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={startEditingStory}
                  disabled={saving || generatingStory}
                >
                  Edit Story
                </button>

                <button
                  type="button"
                  className="secondary-action"
                  onClick={handleGenerateStory}
                  disabled={saving || generatingStory}
                >
                  {generatingStory ? "Regenerating..." : "Regenerate Story"}
                </button>

                <button
                  type="button"
                  className="primary-action"
                  onClick={createNextEpisode}
                  disabled={
                    saving || editingStory || storyboardDuration !== duration
                  }
                >
                  {saving ? "Saving..." : "Approve & Save Episode"}
                </button>
              </div>
            </div>
          </section>
        )}

        {editingStory && editableEpisode && (
          <section className="story-editor" id="story-editor">
            <div className="story-editor-heading">
              <div>
                <span className="section-label">EDIT STORY</span>
                <h2>Edit Episode {nextEpisodeNumber}</h2>
                <p>
                  Changes here do not make another AI request and do not use
                  video credits.
                </p>
              </div>

              <div
                className={
                  editableStoryboardDuration === duration
                    ? "duration-match"
                    : "duration-warning"
                }
              >
                {editableStoryboardDuration} / {duration} seconds
              </div>
            </div>

            <label>
              Episode title
              <input
                value={editableEpisode.title || ""}
                onChange={(event) =>
                  updateEditableField("title", event.target.value)
                }
              />
            </label>

            <label>
              Opening hook
              <textarea
                value={editableEpisode.hook || ""}
                onChange={(event) =>
                  updateEditableField("hook", event.target.value)
                }
              />
            </label>

            <label>
              Episode summary
              <textarea
                value={editableEpisode.episode_summary || ""}
                onChange={(event) =>
                  updateEditableField("episode_summary", event.target.value)
                }
              />
            </label>

            <label>
              Full script
              <textarea
                className="large-editor"
                value={editableEpisode.script || ""}
                onChange={(event) =>
                  updateEditableField("script", event.target.value)
                }
              />
            </label>

            <label>
              Cliffhanger
              <textarea
                value={editableEpisode.cliffhanger || ""}
                onChange={(event) =>
                  updateEditableField("cliffhanger", event.target.value)
                }
              />
            </label>

            <div className="editor-subheading">
              <div>
                <h3>Continuity notes</h3>
                <p>Keep important facts consistent in future episodes.</p>
              </div>

              <button
                type="button"
                className="secondary-action"
                onClick={addContinuityNote}
              >
                Add Note
              </button>
            </div>

            <div className="continuity-editor">
              {(editableEpisode.continuity_notes || []).map((item, index) => (
                <div className="continuity-edit-row" key={index}>
                  <input
                    value={item}
                    onChange={(event) =>
                      updateContinuityNote(index, event.target.value)
                    }
                  />

                  <button
                    type="button"
                    onClick={() => removeContinuityNote(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="editor-subheading">
              <div>
                <h3>Storyboard scenes</h3>
                <p>
                  Adjust scene content and duration before approving the
                  episode.
                </p>
              </div>

              <button
                type="button"
                className="secondary-action"
                onClick={addScene}
              >
                Add Scene
              </button>
            </div>

            <div className="scene-editor-list">
              {(editableEpisode.scenes || []).map((scene, index) => (
                <article className="scene-editor-card" key={index}>
                  <div className="scene-editor-top">
                    <h3>Scene {scene.scene_number || index + 1}</h3>

                    <button
                      type="button"
                      className="remove-scene-button"
                      onClick={() => removeScene(index)}
                    >
                      Remove
                    </button>
                  </div>

                  <label>
                    Duration in seconds
                    <input
                      type="number"
                      min="1"
                      value={scene.duration_seconds || ""}
                      onChange={(event) =>
                        updateScene(
                          index,
                          "duration_seconds",
                          event.target.value,
                        )
                      }
                    />
                  </label>

                  <label>
                    Narration
                    <textarea
                      value={scene.narration || ""}
                      onChange={(event) =>
                        updateScene(index, "narration", event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Dialogue
                    <textarea
                      value={
                        typeof scene.dialogue === "string"
                          ? scene.dialogue
                          : JSON.stringify(scene.dialogue || "")
                      }
                      onChange={(event) =>
                        updateScene(index, "dialogue", event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Caption
                    <textarea
                      value={scene.caption || ""}
                      onChange={(event) =>
                        updateScene(index, "caption", event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Visual prompt
                    <textarea
                      value={scene.visual_prompt || ""}
                      onChange={(event) =>
                        updateScene(index, "visual_prompt", event.target.value)
                      }
                    />
                  </label>

                  <div className="two-columns">
                    <label>
                      Camera direction
                      <textarea
                        value={scene.camera_direction || ""}
                        onChange={(event) =>
                          updateScene(
                            index,
                            "camera_direction",
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Sound direction
                      <textarea
                        value={scene.sound_direction || ""}
                        onChange={(event) =>
                          updateScene(
                            index,
                            "sound_direction",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>

            {editNotice && <div className="warning">{editNotice}</div>}

            <div className="editor-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={cancelEditingStory}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-action"
                onClick={saveStoryEdits}
              >
                Save Changes
              </button>
            </div>
          </section>
        )}

        {activePage === "create" &&
          creationType === "continue" &&
          productionPanelEpisode && (
            <section className="production-panel" id="production-panel">
              <div className="production-heading">
                <div>
                  <span className="section-label">VIDEO PRODUCTION</span>

                  <h2>
                    Episode {productionPanelEpisode.episode_number} —{" "}
                    {productionPanelEpisode.title || "Approved Episode"}
                  </h2>

                  <p>
                    Your story is approved. Production credits are only reserved
                    after you confirm the final cost.
                  </p>
                </div>

                <span className="production-mode-badge">
                  {modes[productionPanelEpisode.generation_mode || "economy"]
                    ?.name || "Economy"}
                </span>
              </div>

              <div className="production-summary-grid">
                <div>
                  <span>Duration</span>
                  <strong>{productionPanelEpisode.duration_seconds}s</strong>
                </div>

                <div>
                  <span>Production</span>
                  <strong>
                    {modes[productionPanelEpisode.generation_mode || "economy"]
                      ?.name || "Economy"}
                  </strong>
                </div>

                <div>
                  <span>Available</span>
                  <strong>{credits} credits</strong>
                </div>

                <div>
                  <span>Reserved</span>
                  <strong>{displayedReservedCredits} credits</strong>
                </div>
              </div>

              {!productionJob && (
                <div className="production-start">
                  <div>
                    <strong>Prepare final production cost</strong>
                    <p>
                      DramaAI will calculate the production charge before any
                      credits are reserved.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="primary-action"
                    onClick={prepareProduction}
                    disabled={productionLoading}
                  >
                    {productionLoading ? "Preparing..." : "Prepare Production"}
                  </button>
                </div>
              )}

              {productionJob && (
                <div className="production-job-card">
                  <div className="production-cost">
                    <span>Final production cost</span>
                    <strong>{productionJob.credits_required} credits</strong>
                  </div>

                  <div className="production-job-details">
                    <div>
                      <span>Job status</span>
                      <strong>
                        {(productionJob.status || "quoted").replace(/_/g, " ")}
                      </strong>
                    </div>

                    <div>
                      <span>Credits reserved</span>
                      <strong>{productionJob.credits_reserved || 0}</strong>
                    </div>

                    <div>
                      <span>Balance after reservation</span>
                      <strong>
                        {productionJob.status === "quoted"
                          ? Math.max(
                              0,
                              credits -
                                Number(productionJob.credits_required || 0),
                            )
                          : credits}
                      </strong>
                    </div>
                  </div>

                  {productionJob.status === "quoted" && (
                    <button
                      type="button"
                      className="primary-action production-confirm-button"
                      onClick={confirmProduction}
                      disabled={
                        reservingCredits ||
                        credits < Number(productionJob.credits_required || 0)
                      }
                    >
                      {reservingCredits
                        ? "Reserving Credits..."
                        : `Confirm & Reserve ${productionJob.credits_required} Credits`}
                    </button>
                  )}

                  {productionJob.status === "quoted" &&
                    credits < Number(productionJob.credits_required || 0) && (
                      <div className="warning">
                        You do not have enough available credits for this
                        production.
                      </div>
                    )}
                </div>
              )}

              {productionNotice && (
                <div className="notice">{productionNotice}</div>
              )}

              {productionJob &&
                ["reserved", "processing"].includes(productionJob.status) && (
                  <div className="full-production-panel">
                    <div className="full-production-heading">
                      <div>
                        <span className="section-label">
                          ECONOMY PRODUCTION ENGINE
                        </span>

                        <h3>Generate the complete episode</h3>

                        <p>
                          DramaAI will create scene visuals, synthetic
                          narration, cinematic motion, captions and the final
                          vertical MP4.
                        </p>
                      </div>

                      <span className="ai-disclosure">AI-generated media</span>
                    </div>

                    <div className="production-stage-list">
                      <div
                        className={
                          productionProgress >= 1 ? "stage-active" : ""
                        }
                      >
                        <span>01</span>
                        <div>
                          <strong>Scene visuals</strong>
                          <small>Faceless cinematic images</small>
                        </div>
                      </div>

                      <div
                        className={
                          productionProgress >= 45 ? "stage-active" : ""
                        }
                      >
                        <span>02</span>
                        <div>
                          <strong>Narration & dialogue</strong>
                          <small>Synthetic voice production</small>
                        </div>
                      </div>

                      <div
                        className={
                          productionProgress >= 65 ? "stage-active" : ""
                        }
                      >
                        <span>03</span>
                        <div>
                          <strong>Cinematic motion</strong>
                          <small>Vertical scene animation</small>
                        </div>
                      </div>

                      <div
                        className={
                          productionProgress >= 65 ? "stage-active" : ""
                        }
                      >
                        <span>04</span>
                        <div>
                          <strong>Captions & sound</strong>
                          <small>Short-form presentation</small>
                        </div>
                      </div>

                      <div
                        className={
                          productionProgress >= 100 ? "stage-active" : ""
                        }
                      >
                        <span>05</span>
                        <div>
                          <strong>Final MP4</strong>
                          <small>1080 × 1920 episode</small>
                        </div>
                      </div>
                    </div>

                    {productionProgress > 0 && (
                      <div className="production-progress-area">
                        <div className="production-progress-top">
                          <span>{productionStage}</span>
                          <strong>{productionProgress}%</strong>
                        </div>

                        <div className="production-progress-track">
                          <div
                            className="production-progress-fill"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, productionProgress),
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {!completedVideoUrl && (
                      <button
                        type="button"
                        className="primary-action full-production-button"
                        onClick={startFullProduction}
                        disabled={fullProductionLoading}
                      >
                        {fullProductionLoading
                          ? "Producing Episode..."
                          : productionJob?.current_stage ===
                              "settlement_pending"
                            ? "Retry Final Settlement"
                            : productionJob?.status === "processing"
                              ? "Resume Production"
                              : "Start Complete Production"}
                      </button>
                    )}

                    {fullProductionError && (
                      <div className="warning">{fullProductionError}</div>
                    )}

                    {productionAssets.length > 0 && (
                      <div className="production-assets">
                        <div className="production-assets-heading">
                          <h3>Generated scene assets</h3>
                          <span>{productionAssets.length} assets</span>
                        </div>

                        <div className="production-assets-grid">
                          {productionAssets
                            .filter(
                              (asset) =>
                                asset.asset_type === "image" &&
                                asset.public_url,
                            )
                            .map((asset) => (
                              <article
                                className="production-asset-card"
                                key={
                                  asset.id ||
                                  `${asset.scene_number}-${asset.public_url}`
                                }
                              >
                                <img
                                  src={asset.public_url}
                                  alt={`Scene ${asset.scene_number}`}
                                />

                                <div>
                                  <span>Scene {asset.scene_number}</span>
                                  <strong>AI Visual</strong>
                                </div>
                              </article>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {sceneAsset?.public_url && (
                <div className="scene-test-result">
                  <span className="section-label">SCENE 1 TEST</span>
                  <img src={sceneAsset.public_url} alt="Generated Scene 1" />
                  <p>{sceneGenerationNotice}</p>
                </div>
              )}

              {sceneGenerationNotice && !sceneAsset && (
                <div className="notice">{sceneGenerationNotice}</div>
              )}
            </section>
          )}

        {completedVideoUrl && (
          <section className="completed-video-panel">
            <div className="completed-video-heading">
              <div>
                <span className="section-label">PRODUCTION COMPLETE</span>
                <h2>Your DramaAI episode is ready</h2>
                <p>
                  The final vertical episode includes AI-generated visuals,
                  synthetic voice, motion and captions.
                </p>
              </div>

              <span className="completed-badge">Completed</span>
            </div>

            <div className="completed-video-layout">
              <div className="completed-video-player">
                <video
                  src={completedVideoUrl}
                  controls
                  playsInline
                  preload="metadata"
                />
              </div>

              <div className="completed-video-details">
                <div>
                  <span>Series</span>
                  <strong>{selectedSeries?.title || "DramaAI Series"}</strong>
                </div>

                <div>
                  <span>Episode</span>
                  <strong>
                    {productionJob?.episode_id
                      ? seriesEpisodes.find(
                          (episode) => episode.id === productionJob.episode_id,
                        )?.episode_number || "Completed"
                      : "Completed"}
                  </strong>
                </div>

                <div>
                  <span>Format</span>
                  <strong>9:16 Vertical MP4</strong>
                </div>

                <div>
                  <span>AI disclosure</span>
                  <strong>AI-generated visuals / synthetic voice</strong>
                </div>

                <a
                  href={completedVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="completed-video-open"
                >
                  Open Final Video
                </a>

                <button
                  type="button"
                  className="primary-action"
                  onClick={async () => {
                    setCompletedVideoUrl("");
                    setProductionJob(null);
                    setProductionProgress(0);
                    setProductionStage("");
                    setProductionAssets([]);
                    setFullProductionError("");

                    if (selectedSeriesId) {
                      await loadSeriesContinuity(selectedSeriesId);
                    }

                    setStory("");
                    setGeneratedEpisode(null);
                    setEditableEpisode(null);
                    setEditingStory(false);

                    window.scrollTo({
                      top: 0,
                      behavior: "smooth",
                    });
                  }}
                >
                  Continue to Next Episode
                </button>
              </div>
            </div>
          </section>
        )}

        {activePage === "generations" && (
          <section className="creator-library">
            <div className="library-topbar">
              <div>
                <span className="section-label">PRODUCTION JOBS</span>
                <h2>Your DramaAI Generations</h2>
                <p>Track reserved, active and completed episode productions.</p>
              </div>

              <button
                type="button"
                className="library-close-button"
                onClick={loadGenerationJobs}
                disabled={generationJobsLoading}
              >
                {generationJobsLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            <div className="library-stats">
              <div>
                <span>Jobs</span>
                <strong>{generationJobs.length}</strong>
              </div>
              <div>
                <span>Reserved</span>
                <strong>
                  {
                    generationJobs.filter((job) => job.status === "reserved")
                      .length
                  }
                </strong>
              </div>
              <div>
                <span>In Production</span>
                <strong>
                  {
                    generationJobs.filter((job) => job.status === "processing")
                      .length
                  }
                </strong>
              </div>
              <div>
                <span>Completed</span>
                <strong>
                  {
                    generationJobs.filter((job) => job.status === "completed")
                      .length
                  }
                </strong>
              </div>
            </div>

            {generationJobsLoading ? (
              <div className="library-empty">
                Loading your production jobs...
              </div>
            ) : generationJobs.length === 0 ? (
              <div className="library-empty">
                <strong>No generations yet.</strong>
                <p>
                  Your production jobs will appear here after you prepare an
                  episode for production.
                </p>
              </div>
            ) : (
              <div className="library-grid">
                {generationJobs.map((job) => {
                  const episode = job.episodes;
                  const status = (job.status || "unknown").replace(/_/g, " ");
                  const stage = (job.current_stage || "Not started").replace(
                    /_/g,
                    " ",
                  );

                  return (
                    <article className="library-card" key={job.id}>
                      <div className="library-thumbnail">
                        <div className="library-thumbnail-placeholder">
                          <span>{episode?.series?.title || "DramaAI"}</span>
                          <strong>
                            EP{" "}
                            {String(episode?.episode_number || 0).padStart(
                              2,
                              "0",
                            )}
                          </strong>
                        </div>
                        <div className="library-status">{status}</div>
                      </div>

                      <div className="library-card-content">
                        <span className="library-series-name">
                          {episode?.series?.title || "DramaAI Series"}
                        </span>
                        <h3>
                          Episode {episode?.episode_number || "—"}
                          {episode?.title ? ` — ${episode.title}` : ""}
                        </h3>
                        <p>
                          Stage: {stage}. Progress: {Number(job.progress || 0)}
                          %.
                        </p>

                        <div className="library-meta">
                          <span>{job.credits_required || 0} credits</span>
                          <span>{job.credits_reserved || 0} reserved</span>
                          <span>{status}</span>
                        </div>

                        <div className="library-card-actions">
                          <button
                            type="button"
                            onClick={() => openGenerationJob(job)}
                          >
                            {job.status === "completed"
                              ? "View Production"
                              : job.status === "processing"
                                ? "Resume Production"
                                : "Open Production"}
                          </button>

                          {job.output_url && (
                            <a
                              href={job.output_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open Video
                            </a>
                          )}

                          {job.status === "completed" && (
                            <button
                              type="button"
                              onClick={() => createVideoVersion(job)}
                            >
                              Create Video Version
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activePage === "library" && libraryOpen && (
          <section className="creator-library">
            <div className="library-topbar">
              <div>
                <span className="section-label">CREATOR LIBRARY</span>
                <h2>Your DramaAI Episodes</h2>
                <p>
                  Review your series, completed productions and episodes still
                  in development.
                </p>
              </div>

              <button
                type="button"
                className="library-close-button"
                onClick={() => {
                  setLibraryOpen(false);
                  setSelectedLibraryEpisode(null);
                  setActivePage("dashboard");
                }}
              >
                Close
              </button>
            </div>

            <div className="library-stats">
              <div>
                <span>Episodes</span>
                <strong>{libraryStats.total}</strong>
              </div>

              <div>
                <span>Completed</span>
                <strong>{libraryStats.completed}</strong>
              </div>

              <div>
                <span>Ready</span>
                <strong>{libraryStats.ready}</strong>
              </div>

              <div>
                <span>In Production</span>
                <strong>{libraryStats.inProduction}</strong>
              </div>
            </div>

            {libraryLoading ? (
              <div className="library-empty">
                Loading your DramaAI library...
              </div>
            ) : libraryEpisodes.length === 0 ? (
              <div className="library-empty">
                <strong>Your library is empty.</strong>
                <p>
                  Create your first series and generate an episode to begin.
                </p>
              </div>
            ) : (
              <div className="library-grid">
                {libraryEpisodes.map((episode) => (
                  <article className="library-card" key={episode.id}>
                    <div className="library-thumbnail">
                      {episode.thumbnail_url ? (
                        <img
                          src={episode.thumbnail_url}
                          alt={
                            episode.title || `Episode ${episode.episode_number}`
                          }
                        />
                      ) : (
                        <div className="library-thumbnail-placeholder">
                          <span>DramaAI</span>
                          <strong>
                            EP {String(episode.episode_number).padStart(2, "0")}
                          </strong>
                        </div>
                      )}

                      <div className="library-status">
                        {(episode.status || "draft").replace(/_/g, " ")}
                      </div>
                    </div>

                    <div className="library-card-content">
                      <span className="library-series-name">
                        {episode.series?.title || "DramaAI Series"}
                      </span>

                      <h3>
                        Episode {episode.episode_number}
                        {episode.title ? ` — ${episode.title}` : ""}
                      </h3>

                      <p>
                        {episode.episode_summary ||
                          "Episode development in progress."}
                      </p>

                      <div className="library-meta">
                        <span>{episode.duration_seconds}s</span>
                        <span>{episode.generation_mode || "economy"}</span>
                        <span>
                          {episode.source === "external"
                            ? "Imported"
                            : "DramaAI"}
                        </span>
                      </div>

                      <div className="library-card-actions">
                        <button
                          type="button"
                          onClick={() => selectLibraryEpisode(episode)}
                        >
                          View Episode
                        </button>

                        {episode.output_url && (
                          <a
                            href={episode.output_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open Video
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {billingOpen && (
          <div
            className="billing-overlay"
            onClick={() => !billingLoading && setBillingOpen(false)}
          >
            <section
              className="billing-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="billing-modal-header">
                <div>
                  <span className="eyebrow">DRAMAAI CREDITS</span>
                  <h2>Buy production credits</h2>
                  <p>
                    Choose a credit pack. Credits are added only after Stripe
                    confirms payment.
                  </p>
                </div>
                <button
                  type="button"
                  className="billing-close"
                  onClick={() => setBillingOpen(false)}
                  disabled={billingLoading}
                  aria-label="Close credit purchase"
                >
                  ×
                </button>
              </div>

              <div className="billing-wallet">
                <div>
                  <span>Available</span>
                  <strong>{credits} credits</strong>
                </div>
                <div>
                  <span>Reserved</span>
                  <strong>{reservedCredits} credits</strong>
                </div>
              </div>

              <div className="credit-pack-grid">
                {creditPacks.map((pack) => (
                  <article
                    className={`credit-pack-card ${pack.id === "creator" ? "credit-pack-featured" : ""}`}
                    key={pack.id}
                  >
                    {pack.id === "creator" && (
                      <span className="credit-pack-badge">Popular</span>
                    )}
                    <h3>{pack.name}</h3>
                    <strong>{pack.credits} credits</strong>
                    <span className="credit-pack-price">{pack.price}</span>
                    <button
                      type="button"
                      onClick={() => buyCreditPack(pack.id)}
                      disabled={billingLoading}
                    >
                      {billingLoading ? "Please wait..." : `Buy ${pack.name}`}
                    </button>
                  </article>
                ))}
              </div>

              {billingNotice && <div className="notice">{billingNotice}</div>}

              <div className="purchase-history">
                <div className="purchase-history-heading">
                  <div>
                    <h3>Purchase History</h3>
                    <p>Your latest DramaAI credit purchases.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadCreditPurchases(user?.id)}
                    disabled={purchaseHistoryLoading}
                  >
                    {purchaseHistoryLoading ? "Loading..." : "Refresh"}
                  </button>
                </div>

                {purchaseHistoryLoading ? (
                  <div className="purchase-history-empty">
                    Loading purchases...
                  </div>
                ) : creditPurchases.length === 0 ? (
                  <div className="purchase-history-empty">
                    No credit purchases yet.
                  </div>
                ) : (
                  <div className="purchase-history-list">
                    {creditPurchases.map((purchase) => (
                      <div className="purchase-history-row" key={purchase.id}>
                        <div>
                          <strong>
                            {purchase.pack_id
                              ? `${purchase.pack_id.charAt(0).toUpperCase()}${purchase.pack_id.slice(1)}`
                              : "Credit Pack"}
                          </strong>
                          <span>
                            {new Date(purchase.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <strong>+{purchase.credits} credits</strong>
                          <span>
                            {new Intl.NumberFormat("en-GB", {
                              style: "currency",
                              currency: (
                                purchase.currency || "gbp"
                              ).toUpperCase(),
                            }).format(Number(purchase.amount_pence || 0) / 100)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="billing-disclosure">
                DramaAI productions may contain AI-generated images, video
                elements and AI-generated voices.
              </div>
            </section>
          </div>
        )}

        {selectedLibraryEpisode && (
          <div
            className="episode-viewer-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedLibraryEpisode(null);
              }
            }}
          >
            <div className="episode-viewer">
              <div className="episode-viewer-topbar">
                <div>
                  <span>
                    {selectedLibraryEpisode.series?.title || "DramaAI Series"}
                  </span>

                  <h2>
                    Episode {selectedLibraryEpisode.episode_number}
                    {selectedLibraryEpisode.title
                      ? ` — ${selectedLibraryEpisode.title}`
                      : ""}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedLibraryEpisode(null)}
                  aria-label="Close episode viewer"
                >
                  ×
                </button>
              </div>

              <div className="episode-viewer-grid">
                <div className="episode-viewer-media">
                  {selectedLibraryEpisode.output_url ? (
                    <video
                      src={selectedLibraryEpisode.output_url}
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : selectedLibraryEpisode.thumbnail_url ? (
                    <img
                      src={selectedLibraryEpisode.thumbnail_url}
                      alt={selectedLibraryEpisode.title || "Episode"}
                    />
                  ) : (
                    <div className="episode-viewer-placeholder">
                      <span>DramaAI Studio</span>
                      <strong>
                        Episode {selectedLibraryEpisode.episode_number}
                      </strong>
                    </div>
                  )}
                </div>

                <div className="episode-viewer-details">
                  <div className="episode-viewer-status">
                    {(selectedLibraryEpisode.status || "draft").replace(
                      /_/g,
                      " ",
                    )}
                  </div>

                  <h3>Episode Summary</h3>

                  <p>
                    {selectedLibraryEpisode.episode_summary ||
                      "No episode summary has been saved yet."}
                  </p>

                  {selectedLibraryEpisode.cliffhanger && (
                    <>
                      <h3>Cliffhanger</h3>
                      <p>{selectedLibraryEpisode.cliffhanger}</p>
                    </>
                  )}

                  <div className="episode-viewer-information">
                    <div>
                      <span>Duration</span>
                      <strong>
                        {selectedLibraryEpisode.duration_seconds}s
                      </strong>
                    </div>

                    <div>
                      <span>Production</span>
                      <strong>
                        {modes[
                          selectedLibraryEpisode.generation_mode || "economy"
                        ]?.name || "Economy"}
                      </strong>
                    </div>

                    <div>
                      <span>Source</span>
                      <strong>
                        {selectedLibraryEpisode.source === "external"
                          ? "Imported"
                          : "DramaAI"}
                      </strong>
                    </div>
                  </div>

                  {productionHistory.length > 0 && (
                    <div className="production-history">
                      <h3>Production History</h3>

                      {productionHistory.map((job) => (
                        <div className="production-history-row" key={job.id}>
                          <div>
                            <strong>
                              {(job.generation_type || "initial").replace(
                                /_/g,
                                " ",
                              )}
                            </strong>
                            <span>
                              {new Date(job.created_at).toLocaleString()}
                            </span>
                          </div>

                          <div>
                            <span>
                              {(job.status || "unknown").replace(/_/g, " ")}
                            </span>
                            <strong>{job.credits_required || 0} credits</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedLibraryEpisode.output_url && (
                    <div className="ai-disclosure">
                      This episode may contain AI-generated visuals and an
                      AI-generated voice.
                    </div>
                  )}

                  <div className="episode-viewer-actions">
                    {selectedLibraryEpisode.output_url && (
                      <a
                        href={selectedLibraryEpisode.output_url}
                        target="_blank"
                        rel="noreferrer"
                        className="episode-viewer-open"
                      >
                        Open Final Video
                      </a>
                    )}

                    <button
                      type="button"
                      className="primary-action"
                      onClick={() =>
                        continueFromLibraryEpisode(selectedLibraryEpisode)
                      }
                    >
                      Continue This Series
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
