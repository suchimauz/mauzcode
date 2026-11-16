/** Settings API projection of a provider: the declaration catalogue plus its effective enablement, computed per request. */
export type ProviderSettingsView = types.models.ProviderView & {
    /** False when the provider id is in the global models.disabledProviders setting. */
    enabled: boolean;
    /** True when models.disabledProviders is fixed by an instance settings file, so the switch cannot be toggled. */
    enabledLocked: boolean;
};