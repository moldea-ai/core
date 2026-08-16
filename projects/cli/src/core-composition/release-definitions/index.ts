// package-backed runtime adapter registrations represented in generated release metadata
export const ACTIVE_RUNTIME_ADAPTER_RELEASE_DEFINITIONS = Object.freeze([
  {
    id: 'anthropic',
    supportedRepositoryFormatVersions: [1],
  },
  {
    id: 'openai',
    supportedRepositoryFormatVersions: [1],
  },
] satisfies readonly {
  id: string;
  supportedRepositoryFormatVersions: readonly number[];
}[]);
