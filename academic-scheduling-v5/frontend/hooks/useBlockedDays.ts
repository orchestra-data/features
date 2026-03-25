/**
 * useBlockedDays — Fetches company_blocked_day + holiday_source for veto validation
 * Returns Maps keyed by YYYY-MM-DD for O(1) lookup in CalendarView and EventModal.
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../../client/apiClient'

interface BlockedDayResponse {
  blockedDate: string
  reason?: string
  companyId?: string | null
}

interface HolidaySourceResponse {
  year: number
  holidays: Array<{ date: string; name: string; type?: string }>
}

export const blockedDaysKeys = {
  all: ['blocked-days'] as const,
  company: (companyId: string) => [...blockedDaysKeys.all, companyId] as const,
}

function toDateKey(d: string): string {
  return d.substring(0, 10)
}

export function useBlockedDays(companyId: string) {
  // Fetch company_blocked_day
  const blockedQuery = useQuery({
    queryKey: [...blockedDaysKeys.company(companyId), 'blocked'],
    queryFn: async () => {
      const res = await fetch(`/api/getCompanyBlockedDays?companyId=${companyId}`, {
        headers: apiClient.getAuthHeaders(),
      })
      if (!res.ok) return { blockedDays: [] as BlockedDayResponse[] }
      return res.json() as Promise<{ blockedDays: BlockedDayResponse[] }>
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  })

  // Fetch holiday_source for current year
  const year = new Date().getFullYear()
  const holidayQuery = useQuery({
    queryKey: [...blockedDaysKeys.company(companyId), 'holidays', year],
    queryFn: async () => {
      const res = await fetch(
        `/api/companies/${companyId}/holiday-sources?year=${year}`,
        { headers: apiClient.getAuthHeaders() },
      )
      if (!res.ok) return { data: [] as HolidaySourceResponse[] }
      return res.json() as Promise<{ data: HolidaySourceResponse[] }>
    },
    enabled: !!companyId,
    staleTime: 30 * 60_000, // holidays don't change often
  })

  // Build Maps for O(1) lookup
  const blockedDays = new Map<string, string>()
  for (const bd of blockedQuery.data?.blockedDays ?? []) {
    blockedDays.set(toDateKey(bd.blockedDate), bd.reason ?? 'Dia bloqueado')
  }

  const holidayMap = new Map<string, string>()
  for (const source of holidayQuery.data?.data ?? []) {
    for (const h of source.holidays ?? []) {
      holidayMap.set(toDateKey(h.date), h.name)
    }
  }

  return {
    blockedDays,
    holidayMap,
    isLoading: blockedQuery.isLoading || holidayQuery.isLoading,
  }
}
