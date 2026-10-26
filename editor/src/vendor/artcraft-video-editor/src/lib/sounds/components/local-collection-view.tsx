import { useEffect, useRef, useState } from "react";
import type { LocalSoundDetails, SoundsAdapter } from "../../adapters/sounds";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import type { SoundEffect } from "../types";
import { useSoundsStore } from "../sounds-store";

const blankDetails = (): LocalSoundDetails => ({ name: "", creator: "", license: "", source: "", tags: [] });

export function LocalCollectionView({ adapter }: { adapter: SoundsAdapter }) {
  const collection = adapter.localCollection!;
  const [query, setQuery] = useState("");
  const [sounds, setSounds] = useState<SoundEffect[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SoundEffect | null>(null);
  const [removing, setRemoving] = useState<SoundEffect | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [details, setDetails] = useState<LocalSoundDetails>(blankDetails);
  const [formError, setFormError] = useState("");
  const addSound = useSoundsStore(state => state.addSoundToTimeline);

  const stop = () => {
    audio.current?.pause();
    if (audio.current) { audio.current.removeAttribute("src"); audio.current.load(); }
    audio.current = null;
    setPlayingId(null);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // This collection is local and already in memory after loading. No remote requests.
    adapter.getTopSounds({ commercialOnly: false }).then(results => {
      if (!cancelled) { setSounds(results); setError(""); }
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load sounds.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [adapter, revision]);

  useEffect(() => () => {
    audio.current?.pause();
    audio.current?.removeAttribute("src");
    audio.current?.load();
    collection.releasePreviews();
  }, [collection]);

  const preview = async (sound: SoundEffect) => {
    const wasPlaying = playingId === sound.id;
    stop();
    if (wasPlaying) return;
    setError("");
    const player = new Audio(sound.previewUrl);
    audio.current = player;
    player.onended = () => { if (audio.current === player) stop(); };
    player.onerror = () => {
      if (audio.current === player) { stop(); setError("Preview failed. The file may not be supported by this browser."); }
    };
    setPlayingId(sound.id);
    try { await player.play(); } catch {
      if (audio.current === player) { stop(); setError("Could not play preview. Try again or use a supported audio format."); }
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      if (editing) await collection.update(editing.id, details);
      else {
        if (!file) throw new Error("Choose an audio file.");
        await collection.importFile(file, details);
      }
      setFormOpen(false);
      setRevision(value => value + 1);
      setNotice(editing ? "Sound details updated." : "Sound added to this device's collection.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save sound.");
    } finally { setBusy(false); }
  };

  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = sounds.filter(sound => {
    const text = [sound.name, sound.username, sound.license, sound.description, ...sound.tags].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  const fieldClass = "border-input bg-background w-full rounded border px-2 py-1 text-sm";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">My sound collection</h2>
        <Button size="sm" disabled={busy} onClick={() => {
          setEditing(null); setFile(null); setDetails(blankDetails()); setFormError(""); setFormOpen(true);
        }}>Add sound</Button>
      </div>
      <details className="text-muted-foreground text-xs">
        <summary className="cursor-pointer">Local files only · rights &amp; storage notes</summary>
        <p className="mt-2">
          Your audio, stored only in this browser on this device. Shared across local projects.
          No online catalog or uploads. Clearing site data removes the collection.
        </p>
        <p className="mt-2">
          Credits and license notes are supplied by you, not verified. Import only audio you have permission to use.
        </p>
      </details>
      <Input aria-label="Search my sounds" placeholder="Search names, tags, credits…" value={query}
        onChange={event => { stop(); setQuery(event.currentTarget.value); }} />
      {error && <p role="alert" className="text-destructive text-xs">{error} <Button size="sm" variant="ghost" onClick={() => setRevision(value => value + 1)}>Retry</Button></p>}
      {notice && <p role="status" className="text-muted-foreground text-xs">{notice}</p>}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? <p className="text-muted-foreground py-4 text-sm">Loading sounds…</p> :
          !filtered.length ? <p className="text-muted-foreground py-4 text-sm">
            {sounds.length ? "No sounds match your search." : "No sounds yet. Add an audio file to build your collection."}
          </p> :
          <div className="flex flex-col gap-3">
            {filtered.map(sound => <section key={sound.id} className="rounded border p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <h3 className="break-words font-medium">{sound.name}</h3>
                <span className="text-muted-foreground shrink-0">{sound.duration.toFixed(1)}s</span>
              </div>
              <p className="mt-1 break-words">Credit: {sound.username}</p>
              <p className="text-muted-foreground break-words">License / rights: {sound.license}</p>
              {sound.description && <p className="text-muted-foreground break-words">Source: {sound.description}</p>}
              {!!sound.tags.length && <p className="text-muted-foreground break-words">Tags: {sound.tags.join(", ")}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                <Button size="sm" variant="outline" aria-label={`${playingId === sound.id ? "Stop" : "Preview"} ${sound.name}`}
                  onClick={() => void preview(sound)}>{playingId === sound.id ? "Stop" : "Preview"}</Button>
                <Button size="sm" disabled={busy} onClick={async () => {
                  stop(); setBusy(true); setNotice("");
                  try {
                    const inserted = await addSound({ sound });
                    if (inserted) setNotice(`${sound.name} inserted at the playhead. A project copy and its credits are saved with the project.`);
                  } finally { setBusy(false); }
                }}>Insert</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
                  setEditing(sound);
                  setDetails({ name: sound.name, creator: sound.username, license: sound.license, source: sound.description, tags: sound.tags });
                  setFormError(""); setFormOpen(true);
                }}>Edit credits</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { stop(); setRemoving(sound); }}>Remove</Button>
              </div>
            </section>)}
          </div>}
      </ScrollArea>
      <Dialog open={formOpen} onOpenChange={open => { if (!busy) setFormOpen(open); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit sound details" : "Add a local sound"}</DialogTitle>
            <DialogDescription>Keep the creator, source, and any required attribution here. These notes do not grant or verify usage rights.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="flex flex-col gap-3 p-4">
            {!editing && <label className="text-sm">Audio file
              <input className={fieldClass} type="file" accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac,.aac" required disabled={busy}
                onChange={event => {
                  const selected = event.currentTarget.files?.[0] ?? null;
                  setFile(selected);
                  if (selected) setDetails(value => ({ ...value, name: value.name || selected.name.replace(/\.[^.]+$/, "") }));
                }} />
            </label>}
            {([
              ["name", "Sound name"], ["creator", "Creator / attribution credit"],
              ["license", "License / permission notes"], ["source", "Source URL or original source"],
            ] as const).map(([key, label]) => <label key={key} className="text-sm">{label}
              <input className={fieldClass} value={details[key]} required={key === "name"} disabled={busy}
                placeholder={key === "license" ? "Unknown unless you supply rights information" : ""}
                onChange={event => setDetails(value => ({ ...value, [key]: event.target.value }))} />
            </label>)}
            <label className="text-sm">Tags (comma separated)
              <input className={fieldClass} value={details.tags.join(",")} disabled={busy}
                onChange={event => setDetails(value => ({ ...value, tags: event.target.value.split(",") }))} />
            </label>
            {formError && <p role="alert" className="text-destructive text-sm">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save sound"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!removing} onOpenChange={open => { if (!open && !busy) setRemoving(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>This removes the sound from your collection on this device. Copies already inserted into projects are kept.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 p-4">
            <Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Cancel</Button>
            <Button disabled={busy} onClick={async () => {
              if (!removing) return;
              setBusy(true);
              try {
                await collection.remove(removing.id);
                setRemoving(null); setRevision(value => value + 1); setNotice("Sound removed from collection.");
              } catch (err) { setRemoving(null); setError(err instanceof Error ? err.message : "Could not remove sound."); }
              finally { setBusy(false); }
            }}>Remove sound</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
