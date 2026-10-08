"use client";

import { useCallback, useEffect, useState } from "react";

function money(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number(value || 0));
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminDashboard({ supabase, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Your session has expired.");

      const response = await fetch("/api/admin/overview", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load admin dashboard.");
      }

      setData(result);
    } catch (error) {
      setMessage(error.message || "Unable to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const overview = data?.overview;

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div>
          <span>DRAMAAI ADMIN</span>
          <h2>Commercial Overview</h2>
          <p>Revenue, credits, production activity and recorded provider costs.</p>
        </div>
        <div className="admin-heading-actions">
          <button type="button" onClick={loadOverview} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          {onClose && (
            <button type="button" className="admin-close" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      {message && <div className="admin-error">{message}</div>}

      {loading && !data ? (
        <div className="admin-loading">Loading commercial data...</div>
      ) : overview ? (
        <>
          <div className="admin-stat-grid">
            <article>
              <span>Users</span>
              <strong>{overview.totalUsers}</strong>
              <small>{overview.creators} creators</small>
            </article>
            <article>
              <span>Credit sales</span>
              <strong>{money(overview.totalCreditSales)}</strong>
              <small>Completed purchases</small>
            </article>
            <article>
              <span>Provider costs</span>
              <strong>{money(overview.providerCost)}</strong>
              <small>Recorded generation cost</small>
            </article>
            <article>
              <span>Gross profit</span>
              <strong>{money(overview.grossProfit)}</strong>
              <small>
                {overview.grossMarginPercent === null
                  ? "No paid revenue yet"
                  : `${overview.grossMarginPercent}% gross margin`}
              </small>
            </article>
            <article>
              <span>Available credits</span>
              <strong>{overview.availableCredits}</strong>
              <small>Across all wallets</small>
            </article>
            <article>
              <span>Reserved credits</span>
              <strong>{overview.reservedCredits}</strong>
              <small>Held for production</small>
            </article>
            <article>
              <span>Credit debt</span>
              <strong>{overview.creditDebt || 0}</strong>
              <small>Refund-related account holds</small>
            </article>
            <article>
              <span>Settlement pending</span>
              <strong>{overview.settlementPendingJobs || 0}</strong>
              <small>Final videos awaiting settlement</small>
            </article>
            <article>
              <span>Completed productions</span>
              <strong>{overview.completedProductions}</strong>
              <small>{overview.creditsConsumed} credits consumed</small>
            </article>
            <article>
              <span>Generation jobs</span>
              <strong>{overview.totalGenerationJobs}</strong>
              <small>{overview.completedEpisodes} completed episodes</small>
            </article>
          </div>

          <div className="admin-columns">
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <h3>Recent credit purchases</h3>
                  <p>Latest customer credit transactions.</p>
                </div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Pack</th>
                      <th>Credits</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentPurchases.length ? (
                      data.recentPurchases.map((purchase) => (
                        <tr key={purchase.id}>
                          <td>{purchase.pack_id || "—"}</td>
                          <td>{purchase.credits}</td>
                          <td>{money(Number(purchase.amount_pence || 0) / 100)}</td>
                          <td>
                            <span className={`admin-status status-${purchase.status}`}>
                              {purchase.status}
                            </span>
                          </td>
                          <td>{dateTime(purchase.created_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5">No purchases yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <h3>Recent production jobs</h3>
                  <p>Latest AI generation activity.</p>
                </div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Stage</th>
                      <th>Progress</th>
                      <th>Credits</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentJobs.length ? (
                      data.recentJobs.map((job) => (
                        <tr key={job.id}>
                          <td>
                            <span className={`admin-status status-${job.status}`}>
                              {job.status}
                            </span>
                          </td>
                          <td>{job.current_stage || "—"}</td>
                          <td>{job.progress || 0}%</td>
                          <td>{job.credits_required || 0}</td>
                          <td>{dateTime(job.created_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5">No generation jobs yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="admin-cost-note">
            Provider cost and margin figures only include costs recorded in
            generation_assets.provider_cost_pence. A zero cost means no provider cost
            has been recorded yet, not that generation was free.
          </div>
        </>
      ) : null}
    </div>
  );
}
