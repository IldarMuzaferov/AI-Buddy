import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApi } from "@/shared/api/endpoints";
import { useSession } from "../store";

export function useApi() {
  const backend = useSession((state) => state.backend),
    token = useSession((state) => state.token);
  return useMemo(() => createApi({ backend, token }), [backend, token]);
}
export function useData<Data>(
  key: readonly unknown[],
  queryFn: () => Promise<Data>,
  enabled = true,
  refetchInterval?: number,
) {
  const backend = useSession((state) => state.backend),
    token = useSession((state) => state.token);
  return useQuery({
    queryKey: [backend, token, ...key],
    queryFn,
    enabled,
    refetchInterval,
  });
}
export function useUpdate() {
  const client = useQueryClient();
  const backend = useSession((state) => state.backend),
    token = useSession((state) => state.token);
  return useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSettled: () => client.invalidateQueries({ queryKey: [backend, token] }),
  });
}
