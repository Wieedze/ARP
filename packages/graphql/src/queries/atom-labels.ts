/** The label of each term id asked for. Atoms and triples both carry one; a triple's is its three
 *  labels joined, which is how the indexer names it. */
export const ATOM_LABELS_QUERY = `
query AtomLabels($ids: [String!]!) {
  terms(where: {id: {_in: $ids}}) {
    id
    atom { label }
    triple { subject { label } predicate { label } object { label } }
  }
}`;
