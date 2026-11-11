/**
 * @edgegamers/s2s-weaponpaints-ds — what other plugins may ask of the DS gate (s2script interop
 * protocol 2).
 */
export interface WeaponPaintsDs {
  /**
   * Fetch the policy from `policy_url` now instead of at the next map start, bypassing caches.
   * Players' items are re-applied if it changed. Does nothing without `policy_url`. The portal
   * bridge calls this when an admin changes the policy on the website.
   */
  reloadPolicy(): void;
}

export declare function reloadPolicy(): void;

export interface Contract {
  methods: WeaponPaintsDs;
  forwards: {};
}
