"use client";

/**
 * The creator dashboard's "Public profile" card: the public photo (change or remove), style tags, the
 * marketplace listing switch, and sample renders (create, approve, reject, remove). Every change is
 * signed by the creator's wallet; removals take effect everywhere at once and are logged server-side.
 */
import { useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import { actionMessage } from "@/lib/auth";
import { api, reason } from "@/lib/client/tx";
import { AGE_RANGES, SAMPLE_SCENES, SAMPLES_PER_DAY, SETTINGS, TONES, type PublicProfile, type StyleTags } from "@/lib/creator-profile";
import { b64u } from "@/lib/crypto/encoding";
import { releaseForSamples, sampleContext } from "@/lib/crypto/release";
import { CreatorFace, pillClass, StatusPill } from "@/components/ds";
import { Note } from "@/components/ui";
import type { ActiveWallet } from "@/components/wallet/WalletProvider";
import { PublicPhotoPicker } from "./PublicPhotoPicker";
import { openReferenceSet } from "./reference";

type MySample = { id: string; scene: string; prompt: string; status: "pending" | "published"; test: boolean; url: string };

export function ProfileCard({ wallet, referenceSetHash }: { wallet: ActiveWallet; referenceSetHash: Hex }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [mode, setMode] = useState<"photo" | "tags" | "samples" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const me = wallet.address.toLowerCase();

  const load = useCallback(async () => {
    const r = await api<{ profiles: Record<string, PublicProfile> }>(`/api/profiles?addresses=${me}`);
    setProfile(r.profiles[me] ?? null);
  }, [me]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const sign = async (action: string, fields: Record<string, string>) => {
    const message = actionMessage(action, { wallet: me, ...fields });
    return { message, signature: await wallet.client.signMessage({ account: wallet.client.account, message }) };
  };
  const run = async (label: string, f: () => Promise<void>) => {
    setBusy(true);
    setMsg(label);
    try {
      await f();
      setMsg(null);
      await load();
    } catch (e) {
      setMsg(reason(e));
    } finally {
      setBusy(false);
    }
  };

  const listedOn = !!profile?.photo && profile.listed;
  return (
    <section id="public-profile" aria-labelledby="public-profile-title" className="flex scroll-mt-6 flex-col gap-5 rounded-[26px] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="public-profile-title" className="m-0 text-[19px] font-semibold">
          Public profile
        </h3>
        <StatusPill kind={listedOn ? "licensed" : "neutral"}>{listedOn ? "Listed in the marketplace" : "Not listed"}</StatusPill>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <CreatorFace seed={me} photo={profile?.photo} size={96} label={profile?.photo ? "Your public photo" : undefined} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {!profile?.photo && (
            <p className="m-0 text-[15px] text-wait">Add a public photo to be listed. Until then brands see a silhouette and you are not in the marketplace.</p>
          )}
          <p className="m-0 text-[14px] text-grey">
            {[...(profile?.tags.tone ?? []), ...(profile?.tags.setting ?? []), profile?.tags.ageRange].filter(Boolean).join(" · ") || "No style tags yet."}{" "}
            · {profile?.samples ?? 0} published sample{profile?.samples === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setMode(mode === "photo" ? null : "photo")} className={pillClass("ink", "min-h-11 px-4 text-[14px]")}>
              {profile?.photo ? "Change photo" : "Add a public photo"}
            </button>
            {profile?.photo && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run("Removing your photo…", async () => {
                    await api("/api/profiles/photo", { method: "POST", body: JSON.stringify({ address: me, remove: true, auth: await sign("remove public photo", {}) }) });
                  })
                }
                className={pillClass("danger", "min-h-11 px-4 text-[14px]")}
              >
                Remove photo
              </button>
            )}
            <button type="button" onClick={() => setMode(mode === "samples" ? null : "samples")} className={pillClass("outline", "min-h-11 px-4 text-[14px]")}>
              Manage samples
            </button>
            <button type="button" onClick={() => setMode(mode === "tags" ? null : "tags")} className={pillClass("outline", "min-h-11 px-4 text-[14px]")}>
              Edit tags
            </button>
          </div>
        </div>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input
          type="checkbox"
          role="switch"
          checked={profile?.listed ?? true}
          disabled={busy || !profile}
          onChange={(e) => {
            const listed = e.target.checked;
            void run(listed ? "Listing you…" : "Unlisting you…", async () => {
              await api("/api/profiles/listing", { method: "POST", body: JSON.stringify({ address: me, listed, auth: await sign("set marketplace listing", { listed: String(listed) }) }) });
            });
          }}
          className="h-5 w-5 accent-[#121316]"
        />
        List me in the marketplace{!profile?.photo ? " (needs a public photo)" : ""}
      </label>

      {mode === "photo" && (
        <div className="rounded-[20px] border border-field p-5">
          <PublicPhotoPicker
            wallet={wallet}
            referenceSetHash={referenceSetHash}
            onDone={() => {
              setMode(null);
              void load();
            }}
          />
        </div>
      )}
      {mode === "tags" && profile && <TagsEditor initial={profile.tags} busy={busy} onSave={(t) => run("Saving tags…", async () => void (await api("/api/profiles/tags", { method: "POST", body: JSON.stringify({ address: me, tags: t, auth: await sign("set style tags", { tone: t.tone.join("|") || "none", setting: t.setting.join("|") || "none", "age range": t.ageRange ?? "none" }) }) })))} />}
      {mode === "samples" && <SamplesManager wallet={wallet} referenceSetHash={referenceSetHash} onChange={() => void load()} />}
      {msg && <Note tone={busy ? "dim" : "down"}>{msg}</Note>}
    </section>
  );
}

function Chips({ legend, options, value, onChange }: { legend: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[14px] font-medium text-grey">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[14px] font-semibold capitalize ${on ? "border-ink bg-ink text-lime" : "border-field bg-white text-ink hover:border-grey"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function TagsEditor({ initial, busy, onSave }: { initial: StyleTags; busy: boolean; onSave: (t: StyleTags) => void }) {
  const [t, setT] = useState<StyleTags>(initial);
  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-field p-5">
      <Chips legend="Tone" options={TONES} value={t.tone} onChange={(tone) => setT({ ...t, tone })} />
      <Chips legend="Setting" options={SETTINGS} value={t.setting} onChange={(setting) => setT({ ...t, setting })} />
      <label className="flex max-w-xs flex-col gap-1.5">
        <span className="text-[14px] font-medium text-grey">Age range (optional, self-declared)</span>
        <select className="min-h-11 rounded-[14px] border border-field bg-white px-4 text-[15px]" value={t.ageRange ?? ""} onChange={(e) => setT({ ...t, ageRange: e.target.value || null })}>
          <option value="">Don&apos;t show</option>
          {AGE_RANGES.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <p className="m-0 text-[13px] text-grey">Likeness never asks for or infers ethnicity, religion, health or other sensitive traits.</p>
      <button type="button" disabled={busy} onClick={() => onSave(t)} className={pillClass("ink", "self-start")}>
        Save tags
      </button>
    </div>
  );
}

function SamplesManager({ wallet, referenceSetHash, onChange }: { wallet: ActiveWallet; referenceSetHash: Hex; onChange: () => void }) {
  const me = wallet.address.toLowerCase();
  const [scenes, setScenes] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [items, setItems] = useState<MySample[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sign = async (action: string, fields: Record<string, string>) => {
    const message = actionMessage(action, { wallet: me, ...fields });
    return { message, signature: await wallet.client.signMessage({ account: wallet.client.account, message }) };
  };
  const list = useCallback(async () => {
    const r = await api<{ samples: MySample[] }>("/api/samples/mine", { method: "POST", body: JSON.stringify({ creator: me, auth: await sign("list my samples", {}) }) });
    setItems(r.samples);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  const prompts = [
    ...SAMPLE_SCENES.filter((s) => scenes.includes(s.key)).map((s) => ({ scene: s.label, prompt: s.prompt })),
    ...(custom.trim().length >= 3 ? [{ scene: "Your prompt", prompt: custom.trim() }] : []),
  ].slice(0, 4);

  async function create() {
    setBusy(true);
    setMsg("Opening your photos with Face ID…");
    let dek: Uint8Array | undefined;
    try {
      const opened = await openReferenceSet(wallet, referenceSetHash);
      dek = opened.dek;
      const { publicKey } = await api<{ publicKey: string }>("/api/samples/key");
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      const context = sampleContext(me, nonce);
      const release = await releaseForSamples(dek, b64u.decode(publicKey), context);
      dek.fill(0);
      setMsg(`Rendering ${prompts.length} sample${prompts.length === 1 ? "" : "s"}… this takes about a minute.`);
      await api("/api/samples", { method: "POST", body: JSON.stringify({ creator: me, auth: await sign("create sample renders", { context }), release, set: opened.set, prompts }) });
      setMsg(null);
      setScenes([]);
      setCustom("");
      await list();
    } catch (e) {
      setMsg(reason(e));
    } finally {
      dek?.fill(0);
      setBusy(false);
    }
  }

  async function decide(id: string, decision: "approve" | "reject" | "remove") {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/samples/decide", { method: "POST", body: JSON.stringify({ creator: me, id, decision, auth: await sign("decide sample", { sample: id, decision }) }) });
      await list();
      onChange();
    } catch (e) {
      setMsg(reason(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-field p-5">
      <p className="m-0 text-[15px] text-grey">
        Sample renders show brands how your face works in a scene. They are made from your photos, released for this one request only; you approve each before it is shown.
        Up to {SAMPLES_PER_DAY} a day.
      </p>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[14px] font-medium text-grey">Scenes (up to 4)</legend>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_SCENES.map((s) => {
            const on = scenes.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => setScenes(on ? scenes.filter((x) => x !== s.key) : [...scenes, s.key])}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[14px] font-semibold ${on ? "border-ink bg-ink text-lime" : "border-field bg-white text-ink hover:border-grey"}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-grey">Or write your own (checked by the same filter as licensed renders)</span>
        <input className="min-h-11 rounded-[14px] border border-field bg-white px-4 text-[15px]" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Reading on a sofa at home, cosy evening light" />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || prompts.length === 0} onClick={create} className={pillClass("lime")}>
          Create sample renders
        </button>
        <button type="button" disabled={busy} onClick={() => list().catch((e) => setMsg(reason(e)))} className={pillClass("outline")}>
          {items ? "Refresh" : "Show my samples"}
        </button>
      </div>
      {msg && <Note tone={busy ? "dim" : "down"}>{msg}</Note>}
      {items && items.length === 0 && <p className="m-0 text-[15px] text-grey">No samples yet.</p>}
      {items && items.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 rounded-[18px] border border-divider p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={`Sample: ${s.scene}`} className="aspect-square w-full rounded-[14px] bg-paper object-cover" />
              <span className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                {s.scene}
                <StatusPill kind={s.status === "published" ? "licensed" : "waiting"}>{s.status === "published" ? "Published" : "Waiting for you"}</StatusPill>
                {s.test && <StatusPill kind="waiting">TEST RENDER</StatusPill>}
              </span>
              <span className="flex flex-wrap gap-2">
                {s.status === "pending" ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => decide(s.id, "approve")} className={pillClass("ink", "min-h-11 px-4 text-[14px]")}>
                      Approve
                    </button>
                    <button type="button" disabled={busy} onClick={() => decide(s.id, "reject")} className={pillClass("outline", "min-h-11 px-4 text-[14px]")}>
                      Reject
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={busy} onClick={() => decide(s.id, "remove")} className={pillClass("danger", "min-h-11 px-4 text-[14px]")}>
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
