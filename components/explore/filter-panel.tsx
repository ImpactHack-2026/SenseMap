'use client'

import { useId } from 'react'
import type { RestaurantFilters } from '@/lib/types'
import {
  activeFilterCount,
  CROWDING_LABELS,
  INTENSITY_LABELS,
  LIGHTING_LABELS,
  NOISE_LABELS,
  SEATING_LABELS,
  SMELL_LABELS,
  TIME_WINDOW_LABELS,
} from '@/lib/sensory'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'

type ArrayKey = Exclude<keyof RestaurantFilters, 'query'>

const GROUPS: { key: ArrayKey; title: string; options: Record<string, string> }[] = [
  { key: 'noise', title: 'Noise', options: NOISE_LABELS },
  { key: 'lighting', title: 'Lighting', options: LIGHTING_LABELS },
  { key: 'crowding', title: 'Crowding', options: CROWDING_LABELS },
  { key: 'smell', title: 'Smell intensity', options: SMELL_LABELS },
  { key: 'seating', title: 'Seating', options: SEATING_LABELS },
  { key: 'intensity', title: 'Overall sensory intensity', options: INTENSITY_LABELS },
  { key: 'bestTime', title: 'Calmer during', options: TIME_WINDOW_LABELS },
]

export function FilterPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: RestaurantFilters
  onChange: (updater: (f: RestaurantFilters) => RestaurantFilters) => void
  onReset: () => void
}) {
  const baseId = useId()
  const toggle = (key: ArrayKey, value: string, checked: boolean) =>
    onChange((f) => {
      const current = f[key] as string[]
      const next = checked ? [...current, value] : current.filter((v) => v !== value)
      return { ...f, [key]: next }
    })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Sensory filters</p>
        {activeFilterCount(filters) > 0 ? (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-8 px-2 text-primary">
            Reset
          </Button>
        ) : null}
      </div>

      {GROUPS.map((group) => (
        <fieldset key={group.key}>
          <legend className="mb-2.5 text-sm font-medium">{group.title}</legend>
          <div className="flex flex-col gap-2.5">
            {Object.entries(group.options).map(([value, label]) => {
              const id = `${baseId}-${group.key}-${value}`
              const checked = (filters[group.key] as string[]).includes(value)
              return (
                <div key={value} className="flex items-center gap-2.5">
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(c) => toggle(group.key, value, c === true)}
                  />
                  <label htmlFor={id} className="cursor-pointer text-sm text-foreground/85">
                    {label}
                  </label>
                </div>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
