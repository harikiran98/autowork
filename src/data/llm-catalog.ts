/**
 * Single source of truth for provider -> model options.
 * The overlay's second dropdown is derived from whatever is selected in the
 * first one, so adding a provider or model here is the only edit required.
 */

export type ProviderId = 'openai' | 'anthropic'

export interface ModelOption {
  id: string
  /** Short hint rendered under the option in the dropdown. */
  note: string
  /** Rough capability tier, used only for the little badge in the UI. */
  tier: 'frontier' | 'balanced' | 'fast' | 'reasoning'
}

export interface Provider {
  id: ProviderId
  label: string
  /** Single hex the provider chip is derived from, in both themes. */
  accent: string
  models: ModelOption[]
}

export const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    accent: '#10a37f',
    models: [
      { id: 'gpt-6-astra', note: 'Flagship — deepest reasoning', tier: 'frontier' },
      { id: 'gpt-5.6-terra', note: 'High capability, long context', tier: 'frontier' },
      { id: 'gpt-5.6-luna', note: 'Tuned for dialogue & drafting', tier: 'balanced' },
      { id: 'gpt-5.5-pro', note: 'Previous-gen flagship', tier: 'balanced' },
      { id: 'gpt-5.4', note: 'General purpose workhorse', tier: 'balanced' },
      { id: 'gpt-5.4-mini', note: 'Cheap, quick turnarounds', tier: 'fast' },
      { id: 'gpt-5.4-nano', note: 'Lowest latency & cost', tier: 'fast' },
      { id: 'o4-mini', note: 'Compact reasoning model', tier: 'reasoning' },
      { id: 'o3', note: 'Deliberate step-by-step reasoning', tier: 'reasoning' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    accent: '#d97757',
    models: [
      { id: 'claude-fable-5.1', note: 'Mythos tier — hardest problems', tier: 'frontier' },
      { id: 'claude-opus-5', note: 'Powerful all-rounder', tier: 'frontier' },
      { id: 'claude-sonnet-5', note: 'Balanced speed & depth', tier: 'balanced' },
      { id: 'claude-haiku-4.5', note: 'Fastest, most economical', tier: 'fast' },
    ],
  },
]

export const PROVIDER_BY_ID: Record<ProviderId, Provider> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p]),
) as Record<ProviderId, Provider>

export const modelsFor = (provider: ProviderId): ModelOption[] => PROVIDER_BY_ID[provider].models

/** Used when the provider changes and the current model no longer belongs to it. */
export const defaultModelFor = (provider: ProviderId): string => modelsFor(provider)[0].id

export const isModelValidFor = (provider: ProviderId, model: string): boolean =>
  modelsFor(provider).some((m) => m.id === model)

export const TIER_COLORS: Record<ModelOption['tier'], string> = {
  frontier: '#7c3aed',
  balanced: '#0284c7',
  fast: '#0d9488',
  reasoning: '#d97706',
}
