import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api.js";
import type {
  AbilityRules,
  ApiKey,
  CreateApiKeyInput,
  CurrentUser,
  Doc,
  ManagedUser,
  MediaRecord,
  Page,
  Role,
  SavedFilter,
  Schema,
  VersionSummary,
  Webhook,
  WebhookEvent,
} from "./types.js";

export function useSchema() {
  return useQuery({
    queryKey: ["schema"],
    queryFn: () => api.get<Schema>("/admin/api/schema"),
    staleTime: Infinity,
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: CurrentUser }>("/admin/api/auth/me").then((r) => r.user),
    retry: false,
  });
}

/** The signed-in user's permission rules, for hiding actions they can't perform. */
export function useAbilityRules() {
  return useQuery({
    queryKey: ["me", "ability"],
    queryFn: () => api.get<{ ability: AbilityRules }>("/admin/api/auth/me").then((r) => r.ability),
    retry: false,
    staleTime: Infinity,
  });
}

/** Whether the deployment has no admin yet — drives the first-run setup screen. */
export function useNeedsSetup(enabled = true) {
  return useQuery({
    queryKey: ["needs-setup"],
    queryFn: () => api.get<{ needsSetup: boolean }>("/admin/api/auth/setup").then((r) => r.needsSetup),
    enabled,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<{ user: CurrentUser }>("/admin/api/auth/login", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<{ user: CurrentUser }>("/admin/api/auth/setup", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/admin/api/auth/logout"),
    onSuccess: () => qc.setQueryData(["me"], null),
  });
}

export function useCollectionDocs(collection: string, search: string) {
  return useQuery({
    queryKey: ["docs", collection, search],
    queryFn: () => api.get<Page>(`/admin/api/${collection}${search}`),
    enabled: Boolean(collection),
  });
}

/**
 * Loads a single document. When `locale` is given, loads that locale's own row
 * (a sibling sharing entity_id); the query resolves to `null` when the variant
 * doesn't exist yet, so the editor can start a fresh draft for it.
 */
export function useDoc(collection: string, id: string | undefined, locale?: string) {
  return useQuery({
    queryKey: ["doc", collection, id, locale ?? null],
    queryFn: () => {
      const qs = locale ? `?locale=${encodeURIComponent(locale)}` : "";
      return api.get<{ doc: Doc | null }>(`/admin/api/${collection}/${id}${qs}`).then((r) => r.doc);
    },
    enabled: Boolean(collection) && Boolean(id),
  });
}

/** A write payload plus an optional review intent that marks the recorded version. */
export interface SaveVars {
  body: Record<string, unknown>;
  /** `"mt"` records the version as machine-translation review (see `?review=mt`). */
  review?: "mt";
}

const reviewQuery = (review?: "mt") => (review === "mt" ? "?review=mt" : "");

export function useCreateDoc(collection: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, review }: SaveVars) =>
      api.post<{ doc: Doc }>(`/admin/api/${collection}${reviewQuery(review)}`, body).then((r) => r.doc),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["docs", collection] }),
  });
}

export function useUpdateDoc(collection: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, review }: SaveVars) =>
      api.patch<{ doc: Doc }>(`/admin/api/${collection}/${id}${reviewQuery(review)}`, body).then((r) => r.doc),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["doc", collection] });
      void qc.invalidateQueries({ queryKey: ["docs", collection] });
    },
  });
}

export function useDeleteDoc(collection: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/${collection}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["docs", collection] }),
  });
}

export function useRelationOptions(collection: string) {
  return useQuery({
    queryKey: ["docs", collection, "?limit=100"],
    queryFn: () => api.get<Page>(`/admin/api/${collection}?limit=100`),
    enabled: Boolean(collection),
  });
}

export function useMediaList() {
  return useQuery({
    queryKey: ["media"],
    queryFn: () => api.get<{ docs: MediaRecord[] }>("/admin/api/media").then((r) => r.docs),
  });
}

export function useUploadMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      api.put<{ doc: MediaRecord }>("/admin/api/media", file, {
        "content-type": file.type || "application/octet-stream",
        "x-filename": file.name,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/media/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}

export function useUpdateMediaAlt() {
  return useMutation({
    mutationFn: (input: { id: string; alt: string }) => api.patch(`/admin/api/media/${input.id}`, { alt: input.alt }),
  });
}

// ---- Version history ----

export function useVersions(collection: string, id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["versions", collection, id],
    queryFn: () => api.get<{ versions: VersionSummary[] }>(`/admin/api/${collection}/${id}/versions`).then((r) => r.versions),
    enabled: enabled && Boolean(collection) && Boolean(id),
  });
}

export function useRestoreVersion(collection: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      api.post<{ doc: Doc }>(`/admin/api/${collection}/${id}/versions/${versionId}/restore`).then((r) => r.doc),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["doc", collection] });
      void qc.invalidateQueries({ queryKey: ["versions", collection, id] });
      void qc.invalidateQueries({ queryKey: ["docs", collection] });
    },
  });
}

// ---- AI ----

export function useAiImprove() {
  return useMutation({
    mutationFn: (input: { text: string; instruction?: string }) =>
      api.post<{ text: string }>("/admin/api/ai/improve", input).then((r) => r.text),
  });
}

export function useAiTranslate() {
  return useMutation({
    mutationFn: (input: { text: string; targetLocale: string; sourceLocale?: string }) =>
      api.post<{ text: string }>("/admin/api/ai/translate", input).then((r) => r.text),
  });
}

export function useAiSummarize() {
  return useMutation({
    mutationFn: (input: { text: string }) =>
      api.post<{ text: string }>("/admin/api/ai/summarize", input).then((r) => r.text),
  });
}

export function useAiSeo() {
  return useMutation({
    mutationFn: (input: { text: string }) =>
      api.post<{ title: string; description: string }>("/admin/api/ai/seo", input),
  });
}

export function useAiAltText() {
  return useMutation({
    mutationFn: (input: { mediaId?: string; url?: string }) =>
      api.post<{ altText: string }>("/admin/api/ai/alt-text", input).then((r) => r.altText),
  });
}

// ---- Webhooks ----

export function useWebhooks() {
  return useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api.get<{ webhooks: Webhook[] }>("/admin/api/webhooks").then((r) => r.webhooks),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; events: WebhookEvent[]; active?: boolean }) =>
      api.post<{ webhook: Webhook; secret: string }>("/admin/api/webhooks", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: Partial<Pick<Webhook, "url" | "events" | "active">> }) =>
      api.patch<{ webhook: Webhook }>(`/admin/api/webhooks/${input.id}`, input.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

// ---- Saved filters ----

export function useSavedFilters(collection: string) {
  return useQuery({
    queryKey: ["saved-filters", collection],
    queryFn: () =>
      api.get<{ filters: SavedFilter[] }>(`/admin/api/saved-filters?collection=${collection}`).then((r) => r.filters),
    enabled: Boolean(collection),
  });
}

export function useCreateSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { collection: string; name: string; query: Record<string, unknown> }) =>
      api.post<{ filter: SavedFilter }>("/admin/api/saved-filters", input),
    onSuccess: (_r, input) => qc.invalidateQueries({ queryKey: ["saved-filters", input.collection] }),
  });
}

export function useDeleteSavedFilter(collection: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/saved-filters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-filters", collection] }),
  });
}

// ---- API keys ----

export function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<{ keys: ApiKey[] }>("/admin/api/auth/api-keys").then((r) => r.keys),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) =>
      api.post<{ key: ApiKey; rawKey: string }>("/admin/api/auth/api-keys", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/admin/api/auth/api-keys/${id}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/auth/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

// ---- Users & roles ----

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: ManagedUser[]; roles: Role[] }>("/admin/api/users"),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    // `password` omitted → email invite; the response carries `inviteUrl` + `temporaryPassword`.
    mutationFn: (input: { email: string; role: string; name?: string; password?: string }) =>
      api.post<{ user: ManagedUser; inviteUrl?: string; temporaryPassword?: string; emailed?: boolean }>(
        "/admin/api/users",
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      api.post<{ user: CurrentUser }>("/admin/api/auth/accept-invite", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; role?: string; disabled?: boolean; name?: string | null }) => {
      const { id, ...patch } = input;
      return api.patch<{ user: ManagedUser }>(`/admin/api/users/${id}`, patch);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}
