import { getRestaurants } from '@/lib/data/restaurants'
import { HomeHero } from '@/components/home/home-hero'
import { CalmPicks } from '@/components/home/calm-picks'
import { HowItWorks } from '@/components/home/how-it-works'

export default async function HomePage() {
  const { restaurants, source } = await getRestaurants()
  const calmest = [...restaurants].sort((a, b) => b.sensory.senseMapScore - a.sensory.senseMapScore).slice(0, 4)

  return (
    <>
      <HomeHero source={source} count={restaurants.length} />
      <CalmPicks restaurants={calmest} />
      <HowItWorks />
    </>
  )
}
