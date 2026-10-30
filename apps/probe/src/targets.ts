/** What the probe reads. Bundled from two committed files, so the Worker carries its own list.
 *
 *  - every package `data/catalogue/package-identity-13579.json` gave an identity (ADR `0087`);
 *  - every candidate endpoint in `data/catalogue/remote-endpoints.json`, which is not an identity
 *    yet: the probe's reading is what the user validates one from.
 *
 *  The list belongs to testnet 13579 because that is where the identities were written. The
 *  readings themselves belong to no chain.
 */
import packages from '../../../data/catalogue/package-identity-13579.json';
import endpoints from '../../../data/catalogue/remote-endpoints.json';

export type Kind = 'endpoint' | 'npm' | 'pypi';

/** `label` is the atom's label, the URL without its scheme, which is what the front looks up by. */
export type Target = { label: string; kind: Kind; repo: string; url: string };

function labelOf(url: string): string {
  return url.replace(/^https:\/\//, '');
}

// The record's `packages` maps a repository to its package's label (`npmjs.com/package/…`).
const fromPackages: Target[] = Object.entries(
  (packages as { packages: Record<string, string> }).packages,
).map(([repo, label]) => ({
  label,
  kind: label.startsWith('pypi.org/') ? 'pypi' : 'npm',
  repo,
  url: `https://${label}`,
}));

const fromEndpoints: Target[] = (
  endpoints as { endpoints: { repo: string; endpoint: string }[] }
).endpoints.map(({ repo, endpoint }) => ({
  label: labelOf(endpoint),
  kind: 'endpoint',
  repo,
  url: endpoint,
}));

export const TARGETS: readonly Target[] = [...fromPackages, ...fromEndpoints];
