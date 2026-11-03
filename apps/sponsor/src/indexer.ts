/** The spellings of a GitHub repository already on the graph, for `POST /list-tool` (ADR `0120`).
 *
 *  A repository atom's label is its normalised URL without the scheme, `github.com/<owner>/<repo>`
 *  (`toolThing`). The label is matched case-insensitively and exactly: `_ilike` with `%`, `_` and `\`
 *  escaped, so a repository name holding an underscore is not a wildcard.
 */
const FETCH_TIMEOUT_MS = 10_000;

export async function repoSpellingsOnGraph(graphqlUrl: string, repo: string): Promise<string[]> {
  const pattern = `github.com/${repo}`.replace(/[\\%_]/g, (match) => `\\${match}`);
  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'query($p: String!) { atoms(where: {label: {_ilike: $p}}, limit: 10) { label } }',
      variables: { p: pattern },
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`the indexer answered HTTP ${response.status}`);
  const body = (await response.json()) as { data?: { atoms?: { label: string | null }[] } };
  if (body.data?.atoms === undefined) throw new Error('the indexer gave no atoms');
  return body.data.atoms
    .map((atom) => atom.label ?? '')
    .filter((label) => label.toLowerCase() === `github.com/${repo}`.toLowerCase())
    .map((label) => label.slice('github.com/'.length));
}
