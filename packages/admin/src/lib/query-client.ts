import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status === 401) && failureCount < 2,
    },
  },
});
