import { useState } from "react";
import { Upload } from "lucide-react";
import { useAiAltText, useDeleteMedia, useMediaList, useSchema, useUpdateMediaAlt, useUploadMedia } from "../lib/hooks.js";
import { Button, Card, EmptyState, Skeleton } from "../components/ui.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog.js";
import { useToast } from "../components/toast.js";
import { useConfirm } from "../components/ConfirmDialog.js";
import type { MediaRecord } from "../lib/types.js";

export function MediaLibrary() {
  const { data: media, isLoading } = useMediaList();
  const upload = useUploadMedia();
  const toast = useToast();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await upload.mutateAsync(file);
    toast({ title: "Uploaded to R2", desc: "Generating alt-text suggestion…", kind: "published" });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="h-14 flex-shrink-0 flex items-center gap-3 px-4 sm:px-5 border-b border-border">
        <h1 className="text-base font-semibold">Media library</h1>
        <span className="font-mono text-xs text-muted-foreground bg-muted rounded-md px-1.5 py-0.5">R2</span>
        <div className="ml-auto">
          <input id="media-upload" type="file" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button variant="default" onClick={() => document.getElementById("media-upload")?.click()}>
            <Upload size={15} />
            Upload
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-5">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        ) : !media?.length ? (
          <EmptyState
            icon={<Upload size={26} />}
            title="No media yet"
            description="Upload an image or file — it's stored in R2 and served from the edge."
            action={
              <Button variant="default" onClick={() => document.getElementById("media-upload")?.click()}>
                Upload
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {media.map((m) => (
              <MediaCard key={m.id} media={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaCard({ media: m }: { media: MediaRecord }) {
  const altText = useAiAltText();
  const updateAlt = useUpdateMediaAlt();
  const del = useDeleteMedia();
  const toast = useToast();
  const confirm = useConfirm();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = m.mime.startsWith("image/");
  const needsAlt = isImage && !m.alt;

  const suggestAlt = async () => {
    const suggestion = await altText.mutateAsync({ mediaId: m.id });
    await updateAlt.mutateAsync({ id: m.id, alt: suggestion });
    toast({ title: "Alt text generated", desc: suggestion, kind: "published" });
  };

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setLightboxOpen(true)} className="block w-full">
        {isImage ? (
          <img src={`/media/${m.id}`} alt={m.alt ?? m.filename} className="h-32 w-full object-cover bg-muted" />
        ) : (
          <div className="h-32 w-full flex items-center justify-center bg-muted text-muted-foreground text-xs font-mono">{m.mime}</div>
        )}
      </button>
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="h-14 flex-shrink-0 flex-row items-center gap-3 px-4 border-b border-border space-y-0">
            <DialogTitle className="text-sm truncate">{m.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-muted p-4">
            {isImage ? (
              <img src={`/media/${m.id}`} alt={m.alt ?? m.filename} className="max-w-full max-h-full object-contain" />
            ) : (
              <a href={`/media/${m.id}`} target="_blank" rel="noreferrer" className="text-brand underline text-sm">
                Open {m.mime}
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <div className="p-2.5">
        <div className="truncate text-[13px] font-medium">{m.filename}</div>
        <div className="text-[11px] text-muted-foreground font-mono">
          {m.width && m.height ? `${m.width}×${m.height} · ` : ""}
          {(m.size / 1024 / 1024).toFixed(1)} MB
        </div>
        {needsAlt ? (
          <button
            onClick={suggestAlt}
            disabled={altText.isPending}
            className="mt-2 w-full text-[12px] font-semibold rounded-md bg-brand-subtle text-brand-subtle-fg px-2 py-1.5 hover:opacity-90 disabled:opacity-50"
          >
            {altText.isPending ? "Generating…" : "Suggest alt text"}
          </button>
        ) : m.alt ? (
          <div className="mt-2 text-[11px] text-muted-foreground line-clamp-2">{m.alt}</div>
        ) : null}
        <button
          onClick={() =>
            confirm({
              title: "Delete this media?",
              message: "The object is removed from R2 and any references break.",
              confirmLabel: "Delete",
              danger: true,
              onConfirm: () => void del.mutateAsync(m.id).then(() => toast({ title: "Media deleted", kind: "danger" })),
            })
          }
          className="mt-1.5 w-full text-[11px] text-danger-fg hover:underline"
        >
          Delete
        </button>
      </div>
    </Card>
  );
}
