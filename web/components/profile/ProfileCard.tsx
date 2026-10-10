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
import { AiTag, btnClass, Card, CreatorFace, StatusPill } from "@/components/ds";
import { Note } from "@/components/ui";
import type { ActiveWallet } from "@/components/wallet/WalletProvider";
import { PublicPhotoPicker } from "./PublicPhotoPicker";
import { openReferenceSet } from "./reference";

type MySample = { id: string; scene: string; prompt: string; status: "pending" | "published"; test: boolean; url: string };

export type ProfileMode = "photo" | "tags" | "samples" | null;

/** The creator's public profile and the signed actions on it, shared by the summary card and the editors. */
export function useCreatorProfile(wallet: ActiveWallet) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
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
  return { me, profile, busy, msg, load, sign, run };
}
export type CreatorProfileState = ReturnType<typeof useCreatorProfile>;

/**
 * The dashboard's "Public profile" card: photo (change or remove), samples, tags and the listing switch.
 * The editors open full width under the page header (ProfileEditors).
 */
export function ProfileSummary({ state, mode, onMode }: { state: CreatorProfileState; mode: ProfileMode; onMode: (m: ProfileMode) => void }) {
  const { me, profile, busy, msg, run, sign } = state;
  const listedOn = !!profile?.photo && profile.listed;
  const tags = [...(profile?.tags.tone ?? []), ...(profile?.tags.setting ?? []), ...(profile?.tags.ageRange ? [profile.tags.ageRange] : [])];
  const open = (m: Exclude<ProfileMode, null>) => onMode(mode === m ? null : m);
  return (
    <Card id="public-profile" title="Public profile" action={<StatusPill kind={listedOn ? "licensed" : "neutral"}>{listedOn ? "Listed" : "Not listed"}</StatusPill>}>
      <div className="flex items-center gap-3">
        <CreatorFace seed={me} photo={profile?.photo} size={72} label={profile?.photo ? (profile.photoAi ? "Your AI-generated public image" : "Your public photo") : undefined} />
        <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
          {profile?.photo ? (
            <span className="text-grey">{profile.photoAi ? "AI-generated · " : ""}Watermarked · 512 px · matched to your face</span>
          ) : (
            <span className="text-wait">Add a public photo to be listed. Until then brands see a silhouette.</span>
          )}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {profile?.photo && profile.photoAi && <AiTag />}
            <button type="button" aria-expanded={mode === "photo"} onClick={() => open("photo")} className="min-h-11 font-semibold underline underline-offset-2">
              {profile?.photo ? "Change" : "Add a public photo"}
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
                className="min-h-11 font-semibold text-bad underline underline-offset-2 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3 text-[13px]">
        <span className="text-grey">
          {profile?.samples ?? 0} sample{profile?.samples === 1 ? "" : "s"} · visible to signed-in brands only
        </span>
        <button type="button" aria-expanded={mode === "samples"} onClick={() => open("samples")} className="min-h-11 font-semibold underline underline-offset-2">
          Manage samples
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length ? (
          tags.map((t) => (
            <span key={t} className="rounded-full bg-paper px-2.5 py-1 text-[12px] capitalize">
              {t}
            </span>
          ))
        ) : (
          <span className="text-[13px] text-grey">No style tags yet.</span>
        )}
        <button type="button" aria-expanded={mode === "tags"} onClick={() => open("tags")} className="ml-auto min-h-11 text-[13px] font-semibold underline underline-offset-2">
          Edit tags
        </button>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-[14px]">
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
      {msg && !mode && <Note tone={busy ? "dim" : "down"}>{msg}</Note>}
    </Card>
  );
}

/** The photo picker, tag editor and samples manager, full width, one at a time. */
export function ProfileEditors({
  state,
  mode,
  onMode,
  wallet,
  referenceSetHash,
}: {
  state: CreatorProfileState;
  mode: ProfileMode;
  onMode: (m: ProfileMode) => void;
  wallet: ActiveWallet;
  referenceSetHash: Hex;
}) {
  const { me, profile, busy, msg, run, sign, load } = state;
  if (!mode) return null;
  const close = (
    <button type="button" onClick={() => onMode(null)} className={btnClass("outline", "min-h-11")}>
      Close
    </button>
  );
  return (
    <Card id="profile-editor" title={mode === "photo" ? "Public photo" : mode === "tags" ? "Style tags" : "Sample renders"} action={close}>
      {mode === "photo" && (
        <PublicPhotoPicker
          wallet={wallet}
          referenceSetHash={referenceSetHash}
          onDone={() => {
            onMode(null);
            void load();
          }}
        />
      )}
      {mode === "tags" && profile && (
        <TagsEditor
          initial={profile.tags}
          busy={busy}
          onSave={(t) =>
            run("Saving tags…", async () => {
              await api("/api/profiles/tags", {
                method: "POST",
                body: JSON.stringify({ address: me, tags: t, auth: await sign("set style tags", { tone: t.tone.join("|") || "none", setting: t.setting.join("|") || "none", "age range": t.ageRange ?? "none" }) }),
              });
              onMode(null);
            })
          }
        />
      )}
      {mode === "samples" && <SamplesManager wallet={wallet} referenceSetHash={referenceSetHash} onChange={() => void load()} />}
      {msg && mode === "tags" && <Note tone={busy ? "dim" : "down"}>{msg}</Note>}
    </Card>
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
    <div className="flex flex-col gap-4">
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
      <button type="button" disabled={busy} onClick={() => onSave(t)} className={btnClass("ink", "self-start")}>
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
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[14px] text-grey">
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
        <button type="button" disabled={busy || prompts.length === 0} onClick={create} className={btnClass("lime")}>
          Create sample renders
        </button>
        <button type="button" disabled={busy} onClick={() => list().catch((e) => setMsg(reason(e)))} className={btnClass("outline")}>
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
                    <button type="button" disabled={busy} onClick={() => decide(s.id, "approve")} className={btnClass("ink", "min-h-11 px-4 text-[14px]")}>
                      Approve
                    </button>
                    <button type="button" disabled={busy} onClick={() => decide(s.id, "reject")} className={btnClass("outline", "min-h-11 px-4 text-[14px]")}>
                      Reject
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={busy} onClick={() => decide(s.id, "remove")} className={btnClass("danger", "min-h-11 px-4 text-[14px]")}>
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
