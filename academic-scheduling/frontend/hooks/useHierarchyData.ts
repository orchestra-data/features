/**
 * useHierarchyData — TanStack Query hooks for content hierarchy navigation
 * SCHED-012: Company > ClassInstance > Pathway > Series wizard data
 *
 * Uses apiClient pattern (fetch, no axios). All query params follow backend conventions.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../client/apiClient';
import type { CompanySummary, ListCompaniesResponse } from '../../../client/apiClient';
import type { ClassInstance, Pathway, Series, PaginatedResponse } from '../../../types/domain';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const hierarchyKeys = {
  all: ['hierarchy'] as const,
  companies: () => [...hierarchyKeys.all, 'companies'] as const,
  classInstances: (companyId: string) =>
    [...hierarchyKeys.all, 'classInstances', companyId] as const,
  pathways: (classInstanceId: string) =>
    [...hierarchyKeys.all, 'pathways', classInstanceId] as const,
  series: (pathwayId: string) =>
    [...hierarchyKeys.all, 'series', pathwayId] as const,
};

// ============================================================================
// useCompanies
// ============================================================================

export function useCompanies() {
  const query = useQuery({
    queryKey: hierarchyKeys.companies(),
    queryFn: () => apiClient.listCompanies({ limit: 100 }),
    staleTime: 5 * 60_000, // 5 min — companies rarely change
  });

  return {
    companies: query.data?.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

// ============================================================================
// useClassInstances
// ============================================================================

export function useClassInstances(companyId: string | undefined) {
  const query = useQuery({
    queryKey: hierarchyKeys.classInstances(companyId ?? ''),
    queryFn: () =>
      apiClient.listClassInstances({
        companyId: companyId!,
        limit: 100,
      }),
    enabled: !!companyId,
    staleTime: 2 * 60_000,
  });

  const result = query.data as PaginatedResponse<ClassInstance> | undefined;

  return {
    classInstances: result?.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

// ============================================================================
// usePathways
// ============================================================================

export function usePathways(classInstanceId: string | undefined) {
  // We need the class instance to get its content (collection) for pathway lookup.
  // The wizard stores the selected class instance, so we fetch its details first,
  // then use the collectionId to list pathways.
  // For simplicity, we accept a companyId fallback and query pathways by company.
  // The parent component passes the relevant IDs.
  const query = useQuery({
    queryKey: hierarchyKeys.pathways(classInstanceId ?? ''),
    queryFn: async () => {
      // First get the class instance to find its content reference
      const classInstance = await apiClient.getClassInstance(classInstanceId!, true);
      // Pathways are linked to collections; use companyId as filter
      const pathways = await apiClient.listPathways({
        companyId: classInstance.companyId,
        limit: 100,
      });
      return pathways;
    },
    enabled: !!classInstanceId,
    staleTime: 2 * 60_000,
  });

  const result = query.data as PaginatedResponse<Pathway> | undefined;

  return {
    pathways: result?.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

// ============================================================================
// useSeries
// ============================================================================

export function useSeries(pathwayId: string | undefined) {
  const query = useQuery({
    queryKey: hierarchyKeys.series(pathwayId ?? ''),
    queryFn: () =>
      apiClient.listSeries({
        pathwayId: pathwayId!,
        limit: 100,
      }),
    enabled: !!pathwayId,
    staleTime: 2 * 60_000,
  });

  const result = query.data as PaginatedResponse<Series> | undefined;

  return {
    series: result?.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
