import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, toQuery } from '@/lib/api';
import type {
  AgentConversation,
  AgentInsight,
  AgentProposedTask,
  AgentStatus,
  ChatResponse,
  ExecutiveReport,
} from '@/types/agent';

// ---- Estado ----
export function useAgentStatus() {
  return useQuery({
    queryKey: ['agent', 'status'],
    queryFn: () =>
      api.get<{ data: AgentStatus }>('/agent/status').then((r) => r.data),
  });
}

// ---- Chat / conversaciones ----
export function useConversations() {
  return useQuery({
    queryKey: ['agent', 'conversations'],
    queryFn: () =>
      api
        .get<{ data: AgentConversation[] }>('/agent/conversations')
        .then((r) => r.data),
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['agent', 'conversations', id],
    enabled: !!id,
    queryFn: () =>
      api
        .get<{ data: AgentConversation }>(`/agent/conversations/${id}`)
        .then((r) => r.data),
  });
}

export function useChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      message: string;
      agentType: string;
      organizationId?: string | null;
      projectId?: string | null;
      conversationId?: string;
    }) => api.post<{ data: ChatResponse }>('/agent/chat', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'conversations'] });
    },
  });
}

export function useQuickAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { action: string; organizationId?: string }) =>
      api
        .post<{ data: ChatResponse }>(
          `/agent/quick-actions/${payload.action}${toQuery({
            organizationId: payload.organizationId,
          })}`,
        )
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'conversations'] });
    },
  });
}

// ---- Insights ----
export function useInsights(filters: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: ['agent', 'insights', filters],
    queryFn: () =>
      api
        .get<{ data: AgentInsight[] }>(`/agent/insights${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useSaveInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/agent/insights', data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['agent', 'insights'] }),
  });
}

export function useUpdateInsightStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; status: string }) =>
      api.patch(`/agent/insights/${payload.id}/status`, {
        status: payload.status,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['agent', 'insights'] }),
  });
}

// ---- Motor de alertas ----
export function useRunAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ data: { active: number; created: number; updated: number; dismissed: number } }>(
        '/alerts/run',
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'insights'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ---- Tareas propuestas ----
export function useProposedTasks(
  filters: Record<string, string | undefined> = {},
) {
  return useQuery({
    queryKey: ['agent', 'proposed-tasks', filters],
    queryFn: () =>
      api
        .get<{ data: AgentProposedTask[] }>(
          `/agent/proposed-tasks${toQuery(filters)}`,
        )
        .then((r) => r.data),
  });
}

export function useSaveProposedTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/agent/proposed-tasks', data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['agent', 'proposed-tasks'] }),
  });
}

export function useProposedTaskAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      id: string;
      action: 'approve' | 'reject' | 'convert';
    }) => api.post(`/agent/proposed-tasks/${payload.id}/${payload.action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'proposed-tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ---- Reportes ----
export function useReports(filters: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: ['agent', 'reports', filters],
    queryFn: () =>
      api
        .get<{ data: ExecutiveReport[] }>(`/agent/reports${toQuery(filters)}`)
        .then((r) => r.data),
  });
}

export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/agent/reports', data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['agent', 'reports'] }),
  });
}
