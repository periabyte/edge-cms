import { useMediaList, useUploadMedia } from "../lib/hooks.js";
import type { MediaRecord } from "../lib/types.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog.js";

/**
 * Modal gallery for picking an existing image (or uploading a new one) from the
 * R2-backed media library. Thumbnails load from the public `/media/:id` route.
 */
export function MediaPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (media: MediaRecord) => void;
}) {
  const { data: media } = useMediaList();
  const upload = useUploadMedia();
  const images = (media ?? []).filter((m) => m.mime.startsWith("image/"));

  const pick = (m: MediaRecord) => {
    onPick(m);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="h-14 flex-shrink-0 flex-row items-center gap-3 px-4 border-b border-border space-y-0">
          <DialogTitle className="text-sm">Insert image</DialogTitle>
          <label className="ml-auto mr-8 inline-flex items-center h-8 px-3 rounded-lg border border-input bg-card-2 text-[13px] text-foreground cursor-pointer hover:bg-accent">
            {upload.isPending ? "Uploading…" : "Upload new"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const { doc } = await upload.mutateAsync(file);
                pick(doc);
              }}
            />
          </label>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {images.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No images yet — use “Upload new” to add one.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pick(m)}
                  className="group rounded-lg border border-border overflow-hidden text-left hover:border-brand focus:border-brand outline-none"
                >
                  <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                    <img src={`/media/${m.id}`} alt={m.alt ?? m.filename} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground truncate group-hover:text-foreground">{m.filename}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
